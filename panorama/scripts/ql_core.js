// ==========================================================================
// ql_core.js — QOLLOCK main runtime (~31k lines)
// ==========================================================================
// ==========================================================================
//   §1  Module setup: State, cache accessors, logging, debug constants
//   §2  Config I/O: read, write, SafeParseConfig, MergeConfig, normalize
//   §3  Gate system: BuildRuntimeFeatureConfigState, ResolveRuntimeGates
//   §4  Core loop: loop(), compassLoop(), buildRequestLoop(), bucket dispatch
//   §5  Healthbar: colored, minimalist, FG, klutz, budhud, minecraft (MC)
//   §6  Enemy/Ally colored health, enemy ult indicators
//   §7  Compass, minimap rotate/flip/zoom/crate/tunnels
//   §8  Top bar: SPM, unspent souls, nicknames, HP warnings, buff/rejuv HUD
//   §9  Shop: layout, quickbuy, recent purchases, item notifications
//   §10 Overlays: keyboard, zip boost, unsecured souls, stat bonuses, urn
//   §11 Combat: combat status, damage numbers/impact, stamina charge
//   §12 Crosshair: item cooldowns, reload CD, target shapes, ammo
//   §13 HUD layout: top/bottom/items/souls bars, chat, damage report
//   §14 Misc: images in chat, on-death arcade, mouse cursor, DL4D, audio
//   §15 Build category payload, account preset binding, settings loader
//   §16 Feature registrations (QOL_REGISTER_FEATURE calls)
//   §17 Bootstrap: $.Schedule startup
// ==========================================================================

'use strict';

// Sandbox guard: if ql_state.js did not load (schema validator sandbox
// loads ql_core.js in isolation), provide a minimal State stub.
var State = typeof State !== "undefined" ? State : { cachedPanels: {} };
var _TLog;
_TLog = function(label, detail) {
    try { $.Msg("[QOLLock][TRACE][" + (label || "") + "] " + (detail || "")); } catch(e) { QOL_WARN("core", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
};
(function() {
    // Verify ql_utils.js loaded before us — log warning if missing
    // (non-fatal: schema validator sandbox runs ql_core.js in isolation)
    var QOL_UTILS_LOADED = typeof QOL_UTILS !== "undefined";
    if (!QOL_UTILS_LOADED) {
        $.Msg("[QOLLock] WARNING: ql_utils.js not loaded before ql_core.js!");
    }

    // Fall back to inline stubs when QOL_UTILS isn't loaded (schema validator sandbox)
    var IsPanelValid = QOL_UTILS_LOADED ? QOL_UTILS.IsPanelValid : function(p) { return p != null && typeof p.IsValid === "function" && p.IsValid(); };
    var PushUnique = QOL_UTILS_LOADED ? QOL_UTILS.PushUnique : function(arr, panel) { if (!arr || !panel) return; for (var _i = 0; _i < arr.length; _i++) { if (arr[_i] === panel) return; } arr.push(panel); };
    // Panel cache accessors — provided by ql_state.js, published on QOL namespace.
    // Sandbox fallback: inline stubs if QOL.getCachedPanel is missing.
    var GetCachedPanel = (typeof QOL !== "undefined" && QOL.getCachedPanel) || function(k) { var p = State.cachedPanels[k]; if (IsPanelValid(p)) return p; State.cachedPanels[k] = null; return null; };
    var SetCachedPanel = (typeof QOL !== "undefined" && QOL.setCachedPanel) || function(k, p) { if (p !== null && p !== undefined && !IsPanelValid(p) && !Array.isArray(p)) { $.Msg("[QOLLock][WARN] SetCachedPanel('" + String(k) + "') called with non-panel value (type=" + typeof p + "). Use direct State.cachedPanels assignment for non-panel data."); } State.cachedPanels[k] = (p === null || p === undefined || IsPanelValid(p) || Array.isArray(p)) ? p : null; };
    var ClearPanelCache = (typeof QOL !== "undefined" && QOL.clearPanelCache) || function() { State.cachedPanels = {}; };
    var SweepStalePanelCache = (typeof QOL !== "undefined" && QOL.sweepStalePanelCache) || function() { var swept = 0; var cache = State.cachedPanels; for (var k in cache) { if (cache.hasOwnProperty(k) && cache[k] && typeof cache[k].IsValid === "function" && !IsPanelValid(cache[k])) { cache[k] = null; swept++; } } return swept; };
    var ResolveCachedPanel = (typeof QOL !== "undefined" && QOL.resolveCachedPanel) || function(parent, cacheKey, traverseId) { var panel = IsPanelValid(State.cachedPanels[cacheKey]) ? State.cachedPanels[cacheKey] : null; if (!panel && parent && parent.FindChildTraverse) { panel = parent.FindChildTraverse(traverseId); State.cachedPanels[cacheKey] = panel || null; } return panel; };
    // Typed cache sandbox fallbacks (Phase 3 — ql_panelcache.js may not be loaded in sandbox)
    var PanelCacheSweep = (typeof QOL !== "undefined" && QOL.panelCacheSweep) || SweepStalePanelCache;
    var PanelCacheResolve = (typeof QOL !== "undefined" && QOL.panelCacheResolve) || ResolveCachedPanel;
    // Config function sandbox fallbacks — provided by ql_config.js when loaded normally.
    // Schema validator sandbox loads ql_core.js in isolation without ql_config.js.
    // NOTE: QOL namespace may not exist at IIFE init time — these check QOL.* at call time.
    var _defCfg = (typeof QOL_DEFAULT_CONFIG === "object" && QOL_DEFAULT_CONFIG) || {};
    function _BDC() { var _f = (typeof QOL !== "undefined" && QOL.buildDefaultConfig); return (_f && _f !== _BDC) ? _f() : ((typeof QOL_DEFAULT_CONFIG === "object" && QOL_DEFAULT_CONFIG) ? Object.assign({}, QOL_DEFAULT_CONFIG) : {}); }
    function _MC(c) { var _f = (typeof QOL !== "undefined" && QOL.mergeConfig); return (_f && _f !== _MC) ? _f(c) : (c || {}); }
    function _SPC(r) { return (typeof QOL !== "undefined" && QOL.safeParseConfig) ? QOL.safeParseConfig(r) : null; }
    function _NHV(v) { return (typeof QOL !== "undefined" && QOL.normalizeHealthbarTypeValue) ? QOL.normalizeHealthbarTypeValue(v) : (Math.round(Number(v)) || 0); }
    var _safeAttrDegradedLogged = false;
    var SafeGetAttribute = QOL_UTILS_LOADED ? QOL_UTILS.SafeGetAttribute : function(p, a, d) { try { return String((p && p.GetAttributeString) ? p.GetAttributeString(a, d || "") : d || ""); } catch(e) { if (!_safeAttrDegradedLogged) { _safeAttrDegradedLogged = true; $.Msg("[QOLLock][WARN][fallback] SafeGetAttribute/SafeSetAttribute fallback active — ql_utils.js not loaded"); } return d || ""; } };
    var SafeSetAttribute = QOL_UTILS_LOADED ? QOL_UTILS.SafeSetAttribute : function(p, a, v) { try { if (p && p.SetAttributeString) { p.SetAttributeString(a, String(v != null ? v : "")); return true; } } catch(e) { if (!_safeAttrDegradedLogged) { _safeAttrDegradedLogged = true; $.Msg("[QOLLock][WARN][fallback] SafeGetAttribute/SafeSetAttribute fallback active — ql_utils.js not loaded"); } } return false; };
    var QOL_DEBUG = QOL_UTILS_LOADED ? QOL_UTILS.DebugLog : function() {};
    var QOL_INFO = QOL_UTILS_LOADED ? QOL_UTILS.InfoLog : function() {};
    var QOL_WARN = QOL_UTILS_LOADED ? QOL_UTILS.WarnLog : function() {};
    var QOL_ERROR = QOL_UTILS_LOADED ? QOL_UTILS.ErrorLog : function(cat, msg) { $.Msg("[QOLLock][ERROR][" + cat + "] " + msg); };

    // Console-accessible debug toggle — type "ToggleQollockDebug()" in Panorama console
    function ToggleQollockDebug() {
        if (!QOL_UTILS_LOADED) { $.Msg("[QOLLock] ql_utils.js not loaded — debug toggle unavailable"); return; }
        var next = !QOL_UTILS.IsDebugEnabled();
        QOL_UTILS.SetDebugEnabled(next);
        $.Msg("[QOLLock] debug logging " + (next ? "ENABLED" : "DISABLED"));
    }
    try { ToggleQollockDebug = ToggleQollockDebug; } catch(e) { QOL_WARN("core", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
    try { if (typeof window !== "undefined") window.ToggleQollockDebug = ToggleQollockDebug; } catch(e) { QOL_WARN("core", "op failed: " + (e && e.message ? e.message : String(e || ""))); }

    var IsCfgEnabled = QOL_UTILS_LOADED ? QOL_UTILS.IsCfgEnabled : function(cfg, key) { return Number(cfg && cfg[key]) === 1; };
    var ProfileHit = QOL_UTILS_LOADED ? QOL_UTILS.ProfileHit : function() {};
    var DumpProfile = QOL_UTILS_LOADED ? QOL_UTILS.DumpProfile : function() {};
    var TimeFeature = QOL_UTILS_LOADED ? QOL_UTILS.TimeFeature : function() {};
    var RecordFrameTime = QOL_UTILS_LOADED ? QOL_UTILS.RecordFrameTime : function() {};
    var DumpTiming = QOL_UTILS_LOADED ? QOL_UTILS.DumpTiming : function() {};

    // State object is defined in ql_state.js (loaded before us in hud.xml).
    // Sandbox guard at top of file provides a minimal { cachedPanels: {} } stub
    // when ql_state.js is not loaded (schema validator sandbox).



    // ConvarStorageProbe removed — GameInterfaceAPI confirmed absent, probe was dead code.
    // WHY: palette color settings are persisted both in MOD_CONFIG (for export/import)
    // and as standalone panel attributes (for synchronous bridging into CSS without
    // waiting for the next loop tick).
    // (Color/storage bridge constants now live in ql_bridge.js — Phase 4)
    // WHY: V2 enemy healthbar toggles are bridged through panel attributes so the
    // native CitadelHealthBarV2 panel can read them without JS polling.
    // ==========================================================================
    // SCHEDULER
    // ==========================================================================
    const CORE_SCHEDULER_V2_ENABLED = true; // rollback switch: set false to revert to v1 scheduler
    const CORE_SCHEDULER_PHASE_COUNT = 5; // stagger work across this many phases per tick
    const CORE_SCHEDULER_STAGGER_CLEANUP = true; // spread cleanup work across phases

    // ==========================================================================
    // LOOP STARTUP TIMING
    // ==========================================================================
    // Delays allow the game's own HUD panels to initialize before QOLLOCK queries them.
    // Too low: panels not found, bootstrap retries waste CPU.
    // Too high: user sees default HUD before QOLLOCK activates.
    const CORE_START_DELAY_LOOP_SEC = 0.05;   // poll immediately; IsConnectedToHideout defers if not ready
    const CORE_START_DELAY_COMPASS_SEC = 0.10; // compass/minimap loop
    const CORE_START_DELAY_BUILD_SEC = 0.10;   // build category payload loop
    // Phase slot assignments (which feature runs in which corePhase % 5)
    const CORE_PHASE_REJUV_NICKNAMES = 0;
    const CORE_PHASE_SPM_STATLOCKER  = 1;
    const CORE_PHASE_UNSPENT_LANE    = 2;
    const CORE_PHASE_UNSECURED       = 3;
    const CORE_PHASE_STAT_BONUSES    = 4;

    // ── Constants index by feature ─────────────────────────────────────────
    // Compass:    COMPASS_INTERVAL_SEC, COMPASS_SPEED_SCALE/QUANT/SAMPLE_MS,
    //             COMPASS_TICK_COUNT, COMPASS_STRETCH_*
    // Unsecured:  UNSECURED_SOULS_RATE_EMA_ALPHA, UNSECURED_SOULS_ETA_*
    // Zip boost:  ZIP_BOOST_READY_FLASH_MS
    // Rejuv:      BUFF_LOCKOUT_SEC, BUFF_PHASE_*, REJUV_*
    // MC health:  MC_* (all MC_ prefixed constants)
    // SPM:        SPM_SAMPLE_INTERVAL_MS, SPM_MAX_PLAYERS
    // Unspent:    UNSPENT_MAX_PLAYERS, UNSPENT_SAMPLE_MS
    // Item mirror:ITEM_MIRROR_*
    // Enemy hp:   ENEMY_COLORED_HEALTH_*
    // Urn:        URN_TRACKER_*
    // DL4D:       DL4D_* (all DL4D_ prefixed constants)
    // Perf:       PERF_DEBUG_*, LOOP_INTERVAL_SEC, LOOP_IDLE_MULTIPLIER, etc.
    // ────────────────────────────────────────────────────────────────────────

    // ==========================================================================
    // INTRA-TICK FEATURE STAGGERING
    // ==========================================================================
    // When enabled, features are collected into offset buckets and dispatched
    // via $.Schedule at staggered intervals within each 200ms tick, spreading
    // CPU load across frames instead of a single spike at t=0.
    const FEATURE_STAGGER_ENABLED = true; // rollback: set false to restore synchronous execution
    const FEATURE_OFFSET_BUCKET_0_MS = 0;
    const FEATURE_OFFSET_BUCKET_1_MS = 0.017;
    const FEATURE_OFFSET_BUCKET_2_MS = 0.033;
    const FEATURE_OFFSET_BUCKET_3_MS = 0.050;
    const FEATURE_OFFSET_BUCKET_4_MS = 0.067;
    const FEATURE_OFFSET_BUCKET_5_MS = 0.083;
    const FEATURE_OFFSET_BUCKET_6_MS = 0.100;
    const FEATURE_OFFSET_BUCKET_7_MS = 0.117;

    // ==========================================================================
    // LOOP INTERVALS (seconds)
    // ==========================================================================
    // 200ms (5Hz) — balance between responsiveness and CPU usage.
    // At 60fps (~16.7ms/frame), the main loop fires every ~12 frames.
    const LOOP_INTERVAL_SEC = 0.2;

    // 50ms (20Hz) — smooth compass rotation, matches typical monitor refresh.
    // Every 3rd frame at 60fps. Below 33ms gives no visible improvement.
    const COMPASS_INTERVAL_SEC = 0.05;

    // Build request loop intervals at three degradation levels
    const BUILD_REQUEST_LOOP_ACTIVE_SEC = 0.05;       // tight poll during save/clear
    const BUILD_REQUEST_LOOP_IDLE_SEC = 0.20;          // in match but not in shop
    const BUILD_REQUEST_LOOP_DEEP_IDLE_SEC = 1.80;     // outside match (menus)

    // Compass idle degradation — uses idle interval when not in custom HUD context
    const COMPASS_INTERVAL_IDLE_SEC = 0.50;
    const COMPASS_INTERVAL_DEEP_IDLE_SEC = 1.0;

    // ==========================================================================
    // MAIN LOOP — IDLE DEGRADATION (Fix 9)
    // ==========================================================================
    // Multiplier applied to LOOP_INTERVAL_SEC at each idle level.
    // active:    0.2s (5Hz)   — in match, HUD visible, normal FPS
    // idle:      0.5s (2Hz)   — HUD hidden or low FPS (below ~20fps)
    // deep_idle: 1.5s (0.67Hz) — not in match (menus)
    // background: 3.0s (0.33Hz) — not in match for extended period
    const LOOP_IDLE_MULTIPLIER = 2.5;        // idle interval = base * 2.5  (0.5s)
    const LOOP_DEEP_IDLE_MULTIPLIER = 7.5;   // deep idle = base * 7.5      (1.5s)
    const LOOP_BACKGROUND_MULTIPLIER = 15;   // background = base * 15      (3.0s)
    const IDLE_DETECTION_CACHE_MS = 2000;     // cache idle state for 2s to avoid per-tick overhead
    const LOW_FPS_THRESHOLD_MS = 50;          // frame time >50ms (~<20fps) triggers low-FPS degradation

    // ==========================================================================
    // BOOTSTRAP & CACHE TIMING
    // ==========================================================================
    // WHY: unit target bootstrap needs multiple retries because the target shape
    // panels are created asynchronously by the game engine after HUD layout loads.
    // 12 tries × 0.10s = 1.2s max wait, which covers the typical 200-800ms panel
    // creation window with margin.
    const UNIT_TARGET_BOOTSTRAP_RETRY_SEC = 0.10;
    const UNIT_TARGET_BOOTSTRAP_MAX_TRIES = 12;
    // WHY: idle refresh rates trade visual responsiveness for CPU. 1200ms for idle
    // is just above human perception of "stale" (1s), and 2500ms for panel cache
    // is long enough to avoid tree walks while still catching new panels within ~2.5s.
    const HUD_INDICATOR_REFRESH_MS_IDLE = 1200;
    const HUD_INDICATOR_REFRESH_MS_HIDE_SMALL = 500;
    const HUD_INDICATOR_PANEL_CACHE_REFRESH_MS_IDLE = 2500;
    const HUD_INDICATOR_PANEL_CACHE_REFRESH_MS_HIDE_SMALL = 700;
    const DAMAGE_NUMBERS_DEFAULT_RUNTIME_SIG = "18|1.00|0|0"; // default damage number config signature

    function ResolveDamageNumbersRuntimeSig(cfg) {
        var rawOpacity = cfg ? cfg.DAMAGE_NUMBER_OPACITY : null;
        var indicatorOpacity = (rawOpacity === undefined || rawOpacity === null) ? 1.0 : parseFloat(rawOpacity);
        if (!isFinite(indicatorOpacity)) indicatorOpacity = 1.0;
        if (indicatorOpacity < 0) indicatorOpacity = 0;
        if (indicatorOpacity > 1) indicatorOpacity = 1;
        var rawSize = cfg ? cfg.HUD_INDICATOR_SIZE : null;
        var indicatorSize = (rawSize === undefined || rawSize === null) ? 18 : Math.round(Number(rawSize));
        if (!isFinite(indicatorSize)) indicatorSize = 18;
        var hideSmallNumbers = (cfg && cfg.ENABLE_HIDE_SMALL_NUMBERS === 1);
        var cleanIndicators = (cfg && IsCfgEnabled(cfg, "ENABLE_CLEAN_DAMAGE_INDICATORS"));
        return String(indicatorSize) + "|" + indicatorOpacity.toFixed(2) + "|" + (hideSmallNumbers ? "1" : "0") + "|" + (cleanIndicators ? "1" : "0");
    }

    // ==========================================================================
    // COMPASS — GEOMETRY
    // ==========================================================================
    // 360° / 22.5° = 16 base ticks + 1 overlap for seamless wrapping at 360°
    const COMPASS_TICK_STEP_DEG = 22.5;
    const COMPASS_TICK_SPACING_PX = 12.5;  // horizontal px between tick marks (controls ring diameter)
    const COMPASS_TICK_COUNT = 17;          // total ticks including wrap-overlap

    // ==========================================================================
    // COMPASS — SPEED DISPLAY
    // ==========================================================================
    // display = raw_speed * SCALE, quantized by QUANT.
    // Empirically tuned so a hero at normal speed shows ~5-7 on the readout.
    //
    // Speed is derived from the local player's minimap-panel position, which is
    // low-resolution (pixel/percent quantized) and refreshes at the game's tick
    // rate — slower and more irregularly than our sample loop. A naive
    // single-step finite difference (dist/dt) over one 50ms window amplifies
    // that quantization into tens-of-units spikes and aliases against the
    // minimap's own update cadence (phantom 0s followed by double-jumps). We
    // instead keep a short sliding window of position samples and fit velocity
    // by least squares over the whole window: every sample contributes, so
    // per-sample quantization noise averages out and intermittent updates are
    // handled gracefully. A light EMA then smooths display flicker.
    const COMPASS_SPEED_SCALE = 2.12;       // unitless multiplier applied to raw speed
    const COMPASS_SPEED_QUANT = 2;          // round display to multiples of this
    const COMPASS_SPEED_SAMPLE_MS = 40;     // position sample cadence (ms); ~6-7 points per window
    const COMPASS_SPEED_WINDOW_MS = 260;    // least-squares velocity window (ms)
    const COMPASS_SPEED_MIN_SPAN_MS = 90;   // need at least this much spanned time before trusting a fit
    const COMPASS_SPEED_EMA_TAU_SEC = 0.11; // light display smoothing on top of the LSQ velocity
    const COMPASS_SPEED_DEADBAND_FRAC = 0.07; // hold steady when change is within this fraction of current

    // ==========================================================================
    // MINIMAP — ROTATION SMOOTHING
    // ==========================================================================
    // North-offset rotation uses an exponential moving average ("tau" = time constant).
    // Two tau values: fast for large heading deltas, slow for small corrections.
    const MINIMAP_ROTATE_NORTH_OFFSET_DEG = 90.0;      // north = +90° in Source 2 coordinate system
    const MINIMAP_ROTATE_DEADZONE_BASE_DEG = 0.45;     // ignore rotation below this when stationary
    const MINIMAP_ROTATE_DEADZONE_MOVING_DEG = 0.18;   // tighter deadzone when moving
    const MINIMAP_ROTATE_TAU_FAST_SEC = 0.06;          // smoothing time-constant for large heading changes
    const MINIMAP_ROTATE_TAU_SLOW_SEC = 0.13;          // smoothing time-constant for small heading changes
    const MINIMAP_ROTATE_FAST_DELTA_DEG = 22.0;        // heading delta threshold to switch to fast tau
    const MINIMAP_ROTATE_MAX_SPEED_DEG_PER_SEC = 540.0; // cap on rotation speed
    const MINIMAP_ROTATE_HEADING_HOLD_MS = 180;         // hold heading for this long before switching to slow tau
    const MINIMAP_ROTATE_PREDICT_SEC = 0.045;           // look-ahead time for velocity-based heading prediction
    const MINIMAP_ROTATE_PREDICT_MAX_DEG = 14.0;        // cap on predicted heading delta
    const MINIMAP_ROTATE_VEL_FILTER_ALPHA = 0.35;       // EMA alpha for velocity filtering (0-1, higher = faster response)

    // ==========================================================================
    // MINIMAP — LAYOUT & SCANNING
    // ==========================================================================
    // WHY: minimap player position scanning at 250ms (4Hz) balances smooth rotation
    // with CPU cost. 90ms fast-path used after teleports/respawns for instant snap.
    const MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_MS = 250;
    const MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_FAST_MS = 90;
    const MINIMAP_DRAW_OVER_UI_REASSERT_MS = 250;           // WHY: re-assert Z-order at 4Hz — infrequent enough to avoid layout thrash, frequent enough to beat game's own reordering
    const MINIMAP_CAST_RANGE_BASE_SIZE = 400.0;             // WHY: 400px at default minimap zoom maps to in-game cast range radius empirically
    const MINIMAP_LAYOUT_BASE_SIZE_PX = 400;                // WHY: default minimap size is 400px square; all zoom levels scale from this base
    const PANEL_LAYOUT_OFFSET_ABS_MAX = 100000;             // WHY: sanity cap prevents runaway layout values from corrupting HUD; 100k px is far beyond any valid screen position
    const GAMEPLAY_MOUSE_CURSOR_ENABLED = true;             // WHY: feature-gate constant — set false to globally disable the custom cursor without touching config
    // WHY: zip boost ready flash lasts 2s — long enough to notice, short enough to not distract during combat
    const ZIP_BOOST_READY_FLASH_MS = 2000;
    // WHY: combat recovery at 3s matches the game's own out-of-combat timer (player stops taking damage for 3s)
    // WHY: enemy health panel scanning at 1200ms — full-tree scan is expensive;
    // 1200ms is the sweet spot where health changes are still visible quickly
    // but the scan cost is amortized over many frames
    const ENEMY_COLORED_HEALTH_PANEL_SCAN_MS = 1200;
    const ENEMY_COLORED_HEALTH_UPDATE_MS = 160;
    const ENEMY_COLORED_HEALTH_DEBUG = false;               // WHY: debug gate — must be false in production; enables per-panel color dump every ~700ms
    const ENEMY_COLORED_HEALTH_DEBUG_THROTTLE_MS = 700;
    const MINIMAP_CRATE_OVERLAY_DEBUG = false;
    const MINIMAP_CRATE_OVERLAY_DEBUG_THROTTLE_MS = 700;
    const BOTTOM_BAR_CURRENCY_DEBUG = false;
    const ULT_CD_DEBUG_ENABLED = false;
    const ENEMY_ULT_OLD_PANEL_SCAN_MS = 1200;
    const ENEMY_UNIT_STATUS_OLD_PANEL_SCAN_MS = Math.min(ENEMY_COLORED_HEALTH_PANEL_SCAN_MS, ENEMY_ULT_OLD_PANEL_SCAN_MS);
    const ENEMY_ULT_OLD_TOPBAR_NAME_REFRESH_MS = 1500;
    // ---- Unsecured Souls overlay ----
    // WHY: source search at 1000ms — the unsecured souls HUD panel doesn't move;
    // re-scanning faster than 1Hz provides no benefit while wasting CPU
    const UNSECURED_SOULS_SOURCE_SEARCH_MS = 1000;
    const UNSECURED_SOULS_MIN_SAMPLE_MS = 250;
    // WHY: EMA alpha of 0.35 gives ~3-sample smoothing window (1/α ≈ 2.86),
    // enough to filter jitter without introducing perceptible lag in the rate display
    const UNSECURED_SOULS_RATE_EMA_ALPHA = 0.35;
    const UNSECURED_SOULS_RATE_MIN = 0.01;
    const UNSECURED_SOULS_RATE_STALE_MS = 12000;
    const UNSECURED_SOULS_RATE_TO_FALLBACK_MAX_RATIO = 2.0;
    const UNSECURED_SOULS_ETA_MAX_SEC = 999;
    // WHY: fallback drain at 0.5%/sec — conservative estimate when rate tracking
    // is stale; matches observed unsecured soul decay in testing
    const UNSECURED_SOULS_FALLBACK_PCT_DRAIN = 0.005;
    const UNSECURED_SOULS_FALLBACK_BASE_FLAT = 1.6;
    const UNSECURED_SOULS_FALLBACK_FLAT_GROWTH = 0.08;
    const UNSECURED_SOULS_THRESH_YELLOW = 500;
    const UNSECURED_SOULS_THRESH_RED = 1000;
    const STAT_BONUSES_DEBUG = false;
    const STAT_BONUSES_DEBUG_MIN_INTERVAL_MS = 600;
    const STAT_BONUSES_SOURCE_SEARCH_MS = 500;
    const STAT_BONUSES_TOOLTIP_SCAN_MS = 250;
    const STAT_BONUSES_TOOLTIP_BREAKDOWN_ID = "StatsBreakdownContainer";
    const STAT_BONUSES_GOLDEN_ROW_KEYS = [
        "#citadel_shopstats_goldenstatues",
        "golden statues",
        "#citadel_shopstats_boons",
        "boons"
    ];
    const STAT_BONUSES_FIRE_RATE_IDS = ["StatContainer_FireRate"];
    const STAT_BONUSES_ABILITY_COOLDOWN_IDS = [
        "StatContainer_TechCooldown",
        "StatContainer_AbilityCooldown",
        "StatContainer_AbilityCooldownReduction",
        "StatContainer_CooldownReduction",
        "StatContainer_Cooldown",
        "StatContainer_CooldownDecrease",
        "StatContainer_AbilityCD"
    ];
    const STAT_BONUSES_SPIRIT_POWER_IDS = [
        "StatContainer_TechPower",
        "StatContainer_SpiritPower",
        "StatContainer_Spirit"
    ];
    const STAT_BONUSES_CLIP_SIZE_IDS = [
        "StatContainer_ClipSizeIncrease",
        "StatContainer_ClipSize",
        "StatContainer_ClipSizeBonus",
        "StatContainer_AmmoCapacity"
    ];
    const STAT_BONUSES_WEAPON_DAMAGE_IDS = [
        "StatContainer_BaseWeaponDamage",
        "StatContainer_BonusBaseWeaponDamage",
        "StatContainer_BaseAttackDamagePercent",
        "StatContainer_BulletDamage"
    ];
    const STAT_BONUSES_MAX_HEALTH_IDS = [
        "StatContainer_MaxHealth",
        "StatContainer_BaseHealth",
        "StatContainer_ArmorPower"
    ];
    const ITEM_MIRROR_PROBE_SCAN_MS = 1630;
    const ITEM_MIRROR_PROBE_SCAN_MS_STABLE = 5270;
    const ITEM_MIRROR_PROBE_SCAN_MS_AFTER_SHOP = 500;
    const ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE = 120;
    const ITEM_MIRROR_RENDER_INTERVAL_MS_ACTIVE = 50;
    const ITEM_MIRROR_TEXT_PROBE_INTERVAL_MS = 80;
    const ITEM_MIRROR_ICON_BASE_SIZE_PX = 45;
    const COLORED_HEALTHBAR_LOW_HP_THRESHOLD = 25;
    const COLORED_HEALTHBAR_MID_HP_THRESHOLD = 65;
    const COLORED_HEALTHBAR_HIGH_HP_THRESHOLD = 75;
    const COLORED_HEALTHBAR_PULSE_STEP = 0.1;
    const COLORED_HEALTHBAR_COLOR_RED = [255, 0, 0];
    const COLORED_HEALTHBAR_COLOR_DARK_RED = [222, 0, 0];
    const COLORED_HEALTHBAR_COLOR_ORANGE = [255, 177, 0];
    const COLORED_HEALTHBAR_COLOR_YELLOW = [255, 240, 120];
    // Healthbar type enum (matches ql_settings.js healthbar type dropdown order)
    const HEALTHBAR_TYPE_DEFAULT    = 0;
    const HEALTHBAR_TYPE_MINIMALIST = 1;
    const HEALTHBAR_TYPE_FG         = 2;
    const HEALTHBAR_TYPE_KLUTZ      = 3;
    const HEALTHBAR_TYPE_BUDHUD     = 4;
    const HEALTHBAR_TYPE_MINECRAFT  = 5;
    const COLORED_HEALTHBAR_COLOR_WHITE = [255, 255, 255];
    const ENEMY_TOPBAR_HEALTH_DEFAULT_COLOR = [255, 86, 86];
    const ALLY_TOPBAR_HEALTH_DEFAULT_COLOR = COLORED_HEALTHBAR_COLOR_WHITE;
    const ENEMY_COLORED_HEALTH_TEAM1_COLOR = [255, 201, 97];
    const ENEMY_COLORED_HEALTH_TEAM2_COLOR = [100, 133, 252];
    const ENEMY_COLORED_HEALTH_NEUTRAL_COLOR = [91, 239, 181];
    const ENEMY_COLORED_HEALTH_PULSE_COLOR = [225, 97, 97];
    const ENEMY_COLORED_HEALTH_PULSE_DARK_COLOR = [85, 28, 28];
    const ENEMY_COLORED_HEALTH_MID_COLOR = [255, 123, 0];
    const ITEM_MIRROR_RAPID_RETRIGGER_WINDOW_MS = 1300;
    const ITEM_MIRROR_RAPID_RETRIGGER_SUPPRESS_MS = 900;
    const ITEM_MIRROR_READY_OVERLAY_FLASH_MS = 420;
const ITEM_MIRROR_FLASH_DEBUG = false;
const ITEM_MIRROR_PROBE_DEBUG = false;
const ITEM_MIRROR_COOLDOWN_DEBUG = false;
const ITEM_MIRROR_COOLDOWN_DEBUG_THROTTLE_MS = 350;
const ITEM_MIRROR_EXPRESS_DEBUG = false;
const ITEM_MIRROR_EXCEPTION_DEBUG = false;
    // TEMP TEST SWITCH: keep base + optimize item cooldown paths enabled together for offset alignment checks.
    const ITEM_COOLDOWN_DUAL_MODE_TEST = false;
    // WHY: max 13 players covers 6v6 (12) + 1 extra slot for spectators/bots.
    // SPM window of 60 samples at 1s intervals = 60s rolling average.
    const SPM_MAX_PLAYERS = 13;
    // WHY: panel cache at 7s — SPM changes slowly (1 sample/sec), re-scanning
    // faster provides no benefit while wasting CPU on tree walks
    const SPM_PANEL_CACHE_REFRESH_MS = 7000;
    const SPM_PLAYER_CACHE_REFRESH_BATCH = 4;
    const TOPBAR_PLAYER_PANEL_CACHE_REFRESH_MS = 1500;
    // WHY: nickname refresh at 1s initially, then 4.2s once stable — player names
    // WHY: 280ms sample interval (~3.6Hz) — fast enough to catch soul swings during
    // urn fights, slow enough to not dominate the main loop budget
    const URN_TRACKER_SAMPLE_INTERVAL_MS = 280;
    const URN_TRACKER_PANEL_CACHE_REFRESH_MS = 4200;
    const ULT_CD_MAX_PLAYERS = 12;
    const ULT_CD_SLOT_MIN_INDEX = 0;
    const ULT_CD_SLOT_MAX_INDEX = ULT_CD_MAX_PLAYERS - 1;
    const ULT_CD_FULL_RESCAN_MS = 30000;     // WHY: periodic full cache flush every 30s to self-heal stale lookups from destroyed/recreated panels
    const TARGET_SHAPE_DEBUG = false;
    const TARGET_SHAPE_DEBUG_THROTTLE_MS = 1000;
    const HEALTHBAR_VIS_DEBUG = false;
    const HEALTHBAR_VIS_DEBUG_THROTTLE_MS = 1000;
    const MINIMAP_CRATE_OVERLAY_MARKER_SIZE_PX = 2;
    const MINIMAP_CRATE_OVERLAY_MARKER_OPACITY = 0.75;
    const MINIMAP_CRATE_OVERLAY_MARKER_BORDER_OPACITY = 0.45;
    const ACCOUNT_PROBE_DEEP_SCAN_INTERVAL_MS = 2000;
    const ACCOUNT_PROBE_REPORT_INTERVAL_MS = 10000;
    const ACCOUNT_PROBE_MAX_PANELS = 4000;
    const ACCOUNT_PROBE_LOG = false;
    const URN_TRACKER_DEBUG = false;
    const PERF_DEBUG_FLUSH_MS = 5000;
    const PERF_DEBUG_SLOW_MS = 8;
    const PERF_DEBUG_TOP_COUNT = 10;
    const LOOP_ERROR_LOG_INTERVAL_MS = 2000;
    // (USER_EDIT_REV_ATTR now lives in ql_bridge.js — Phase 4)
    // Panel IDs used with FindChildTraverse / FindChildrenWithClassTraverse
    const PANEL_ID_HUD = QOL_PANEL_ID_HUD;
    const PANEL_ID_HEALTH_CONTAINER = "health_and_abilities_container";
    const PANEL_ID_GAMEPLAY_HUD = "gameplay_hud";
    const PANEL_ID_ABILITIES_CONTAINER = "AbilitiesContainer";
    const PANEL_ID_TOP_BAR = "TopBar";
    const PANEL_ID_GOLD_AP_CONTAINER = "gold_and_ap_container";
    const PANEL_ID_HERO_SHOP = "CitadelHudHeroShop";
    const PANEL_ID_MINIMAP = "hud_minimap";
    const PANEL_ID_SIGNATURE = "hud_signature";
    const PANEL_ID_SHOP_MODS_SELECTED_BUILD = "ShopModsSelectedBuild";
    const BUILD_CATEGORY_PAYLOAD_ENABLED = true;
    const BUILD_LOADER_TEMP_DISABLED = false;
    const BUILD_CATEGORY_PAYLOAD_SCAN_INTERVAL_MS = 1000;
    const BUILD_CATEGORY_PAYLOAD_TEXT_SCAN_MAX_PANELS = 1500;
    const BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID = "hero_skyrunner";
    const BUILD_CATEGORY_PAYLOAD_HERO_SWITCH_DELAY_MS = 50;   // poll immediately after switch
    const BUILD_CATEGORY_PAYLOAD_HERO_SWITCH_POLL_MS = 100;   // poll interval (was 20 — too tight)
    const BUILD_CATEGORY_PAYLOAD_HERO_SWITCH_MAX_WAIT_MS = 4000;  // reduced timeout
    const BUILD_CATEGORY_PAYLOAD_STORAGE_CONFIRM_REQUIRED_HITS = 2;
    const BUILD_CATEGORY_PAYLOAD_HERO_SCAN_WAIT_MS = 50;   // poll every tick
    const BUILD_CATEGORY_PAYLOAD_HERO_PROBE_MAX_MS = 4000;  // reduced timeout
    const BUILD_CATEGORY_PAYLOAD_HERO_PROBE_RETRY_DELAY_MS = 1500;  // reduced backoff
    const BUILD_CATEGORY_PAYLOAD_HERO_PROBE_MAX_MISSES = 3;
    const BUILD_CATEGORY_PAYLOAD_MISSING_SCAN_MAX_ADVANCES = 6;  // fewer scans per build
    const BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS = 100;  // minimal UI settle time
    const BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS = 100;  // poll-driven
    const BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_DELETE_SETTLE_MS = 150;  // reduced
    const BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_MAX_RETRIES = 60;  // more retries, faster
    const BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_TIMEOUT_MS = 15000;  // reduced
    const BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_PROMPT_RETRIES = 3;
    const BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_EMPTY_CONFIRM_HITS = 3;
    const BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_SAME_TITLE_LIMIT = 1;
    const BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_POST_SETTLE_MS = 300;  // reduced from 900
    const BUILD_CATEGORY_PAYLOAD_WAIT_STORAGE_USER_PROMPT_MS = 2500;  // reduced from 6000
    const BUILD_CATEGORY_PAYLOAD_USER_PROMPT_POLL_MS = 50;   // poll-driven
    const BUILD_CATEGORY_PAYLOAD_BOOTSTRAP_MAX_RETRIES = 15;
const BUILD_CATEGORY_PAYLOAD_SCHEMA_SEMVER = (typeof QOL_SCHEMA_SEMVER === "string" && QOL_SCHEMA_SEMVER.length > 0)
    ? QOL_SCHEMA_SEMVER
    : "2.3.5";
    const BUILD_CATEGORY_PAYLOAD_SCHEMA_TOKEN_VERSION = String(BUILD_CATEGORY_PAYLOAD_SCHEMA_SEMVER || "").replace(/\./g, "-");
    const BUILD_CATEGORY_PAYLOAD_EXPORT_PREFIX = "[QOL-" + BUILD_CATEGORY_PAYLOAD_SCHEMA_TOKEN_VERSION + "]:";
    const BUILD_CATEGORY_PAYLOAD_TOKEN_REGEX = /^\[QOL-(\d+-\d+-\d+)\]:([A-Za-z0-9\-_]+)$/i;
    const BUILD_CATEGORY_PAYLOAD_TOKEN_EXTRACT_REGEX = /(\[QOL-\d+-\d+-\d+\]:[A-Za-z0-9\-_]+)/i;
    const BUILD_CATEGORY_PAYLOAD_DONE_REARM_MAX_ATTEMPTS = 4;
    const BUILD_CATEGORY_PAYLOAD_SOURCE_BOOTSTRAP_STEP_MS = 50;   // poll every tick
    const BUILD_CATEGORY_PAYLOAD_SOURCE_BOOTSTRAP_MAX_RETRIES = 14;
    const BUILD_CATEGORY_PAYLOAD_INIT_STEP_DELAY_MS = 50;   // poll-driven
    const BUILD_CATEGORY_PAYLOAD_INIT_VERIFY_DELAY_MS = 50;  // poll-driven
    const BUILD_CATEGORY_PAYLOAD_INIT_CREATE_VERIFY_WINDOW_MS = 1200;  // extended for non-English UI render latency
    const BUILD_CATEGORY_PAYLOAD_INIT_MAX_RETRIES = 20;  // more attempts for build detection
    const BUILD_CATEGORY_PAYLOAD_INIT_MAX_CREATE_ATTEMPTS = 3;
    const BUILD_CATEGORY_PAYLOAD_LOADER_SESSION_MAX_CREATE_ATTEMPTS = 2;
    const BUILD_CATEGORY_PAYLOAD_POST_SWITCH_SHOP_OPEN_DELAY_SEC = 0.05;  // poll-driven
    const BUILD_CATEGORY_PAYLOAD_POST_SWITCH_SHOP_CLOSE_DELAY_SEC = 0.05; // poll-driven
    const BUILD_CATEGORY_PAYLOAD_PRE_RESTORE_DELAY_SEC = 0.20;  // minimal settle
    const SETTINGS_LOADER_ENABLED = true;
    const SETTINGS_LOADER_DEBUG = false;
    const SETTINGS_LOADER_DEBUG_THROTTLE_MS = 350;
    const SETTINGS_LOADER_TRACE = false;
    const SETTINGS_LOADER_TRACE_THROTTLE_MS = 1000;
    const SETTINGS_LOADER_REASSERT_MS = 250;
    const SETTINGS_LOADER_HOLD_MS = 1000;
    const SETTINGS_LOADER_OVERLAY_ID = "QOLSettingsLoaderOverlay";
    const SETTINGS_LOADER_CARD_ID = "QOLSettingsLoaderCard";
    const SETTINGS_LOADER_WARNING_ID = "QOLSettingsLoaderWarning";
    const SETTINGS_LOADER_TITLE_ID = "QOLSettingsLoaderTitle";
    const SETTINGS_LOADER_SUBTITLE_ID = "QOLSettingsLoaderSubtitle";
    const SETTINGS_LOADER_LEGACY_STEPS_ID = "QOLSettingsLoaderSteps";
    const SETTINGS_LOADER_STEPS_WRAP_ID = "QOLSettingsLoaderStepsWrap";
    const SETTINGS_LOADER_STEP_ROW_ID_PREFIX = "QOLSettingsLoaderStepRow_";
    const SETTINGS_LOADER_STEP_ICON_ID_SUFFIX = "_Icon";
    const SETTINGS_LOADER_STEP_LABEL_ID_SUFFIX = "_Label";
    const SETTINGS_LOADER_DETAIL_ID = "QOLSettingsLoaderDetail";
    const SETTINGS_LOADER_ACTIONS_ID = "QOLSettingsLoaderActions";
    const SETTINGS_LOADER_SKIP_DOCK_ID = "QOLSettingsLoaderSkipDock";
    const SETTINGS_LOADER_SKIP_BACKER_ID = "QOLSettingsLoaderSkipBacker";
    const SETTINGS_LOADER_SKIP_BUTTON_ID = "QOLSettingsLoaderSkipButton";
    const SETTINGS_LOADER_SKIP_LABEL_ID = "QOLSettingsLoaderSkipButtonLabel";
    const SETTINGS_LOADER_SKIP_TEXT = "Skip";
    const SETTINGS_LOADER_WARNING_TEXT = "DO NOT PRESS ANY KEYS UNTIL COMPLETE UNLESS PROMPTED";
    const SETTINGS_LOADER_ICON_PENDING = "s2r://panorama/images/getting_started/checklist_task_empty_png.vtex";
    const SETTINGS_LOADER_ICON_DONE = "s2r://panorama/images/getting_started/checklist_task_complete_png.vtex";
    const SETTINGS_LOADER_ICON_ACTIVE = "s2r://panorama/images/glyphs/arrow_right.vsvg";
    const SETTINGS_LOADER_ICON_ERROR = "s2r://panorama/images/control_icons/x_close_filled_png.vtex";
    const SETTINGS_LOADER_CORRUPT_PROMPT_DETAIL = "Potential corrupt save detected.\nPlease open your shop to resolve.\nPlease patient and allow the loader to run.";
    const LOADER_DETAIL_SPINNER_FRAMES = ["|", "/", "-", "\\"];
    const LOADER_DETAIL_SPINNER_FRAME_MS = 180;
    const SETTINGS_LOADER_STEPS = [
        { key: "start", label: "Start" },
        { key: "switch_airheart", label: "Switching to Skyrunner" },
        { key: "confirm_airheart", label: "Confirming Skyrunner Context" },
        { key: "read_payload", label: "Reading Build Payload (Read-Only)" },
        { key: "decode_payload", label: "Decoding Payload" },
        { key: "apply_config", label: "Applying Config" },
        { key: "return_hero", label: "Returning To Original Hero" },
        { key: "complete", label: "Complete" }
    ];
    const SAVE_SETTINGS_LOADER_ENABLED = true;
    const SAVE_SETTINGS_LOADER_REASSERT_MS = 250;
    const SAVE_SETTINGS_LOADER_HOLD_MS = 1000;
    const SAVE_SETTINGS_LOADER_OVERLAY_ID = "QOLSaveSettingsLoaderOverlay";
    const SAVE_SETTINGS_LOADER_CARD_ID = "QOLSaveSettingsLoaderCard";
    const SAVE_SETTINGS_LOADER_WARNING_ID = "QOLSaveSettingsLoaderWarning";
    const SAVE_SETTINGS_LOADER_TITLE_ID = "QOLSaveSettingsLoaderTitle";
    const SAVE_SETTINGS_LOADER_STEPS_WRAP_ID = "QOLSaveSettingsLoaderStepsWrap";
    const SAVE_SETTINGS_LOADER_STEP_ROW_ID_PREFIX = "QOLSaveSettingsLoaderStepRow_";
    const SAVE_SETTINGS_LOADER_STEP_ICON_ID_SUFFIX = "_Icon";
    const SAVE_SETTINGS_LOADER_STEP_LABEL_ID_SUFFIX = "_Label";
    const SAVE_SETTINGS_LOADER_DETAIL_ID = "QOLSaveSettingsLoaderDetail";
    const SAVE_SETTINGS_LOADER_STALL_HINT_ID = "QOLSaveSettingsLoaderStallHint";
    const SAVE_SETTINGS_LOADER_STALL_HINT_TEXT = "If saving stalls, open your shop.";
    const SAVE_SETTINGS_LOADER_STEPS = [
        { key: "start", label: "Start" },
        { key: "switch_airheart", label: "Switching to Skyrunner" },
        { key: "confirm_airheart", label: "Confirming Skyrunner Context" },
        { key: "prepare_build", label: "Preparing Build UI" },
        { key: "write_payload", label: "Writing Payload" },
        { key: "commit_save", label: "Saving Build" },
        { key: "verify_save", label: "Verifying Save" },
        { key: "return_hero", label: "Returning To Selected Hero" },
        { key: "complete", label: "Complete" }
    ];
    const CLEAR_SETTINGS_LOADER_ENABLED = true;
    const CLEAR_SETTINGS_LOADER_REASSERT_MS = 250;
    const CLEAR_SETTINGS_LOADER_HOLD_MS = 1000;
    const CLEAR_SETTINGS_LOADER_OVERLAY_ID = "QOLClearSettingsLoaderOverlay";
    const CLEAR_SETTINGS_LOADER_CARD_ID = "QOLClearSettingsLoaderCard";
    const CLEAR_SETTINGS_LOADER_WARNING_ID = "QOLClearSettingsLoaderWarning";
    const CLEAR_SETTINGS_LOADER_TITLE_ID = "QOLClearSettingsLoaderTitle";
    const CLEAR_SETTINGS_LOADER_STEPS_WRAP_ID = "QOLClearSettingsLoaderStepsWrap";
    const CLEAR_SETTINGS_LOADER_STEP_ROW_ID_PREFIX = "QOLClearSettingsLoaderStepRow_";
    const CLEAR_SETTINGS_LOADER_STEP_ICON_ID_SUFFIX = "_Icon";
    const CLEAR_SETTINGS_LOADER_STEP_LABEL_ID_SUFFIX = "_Label";
    const CLEAR_SETTINGS_LOADER_DETAIL_ID = "QOLClearSettingsLoaderDetail";
    const CLEAR_SETTINGS_LOADER_STEPS = [
        { key: "start", label: "Start" },
        { key: "switch_airheart", label: "Switching to Skyrunner" },
        { key: "confirm_airheart", label: "Confirming Skyrunner Context" },
        { key: "open_builds", label: "Opening Builds List" },
        { key: "delete_builds", label: "Deleting Builds" },
        { key: "verify_clear", label: "Verifying Clear" },
        { key: "return_hero", label: "Returning To Selected Hero" },
        { key: "complete", label: "Complete" }
    ];
    // (Build save/clear + hero hint bridge constants now live in ql_bridge.js — Phase 4)
    const BUILD_CORRUPT_REPAIR_PENDING_ATTR = "QOL_CORRUPT_REPAIR_PENDING";
    const BUILD_SAVE_ACTION_DELAY_MS = 20;    // poll-driven
    const BUILD_SAVE_AFTER_WRITE_DELAY_MS = 30;   // poll-driven
    const BUILD_SAVE_VERIFY_DELAY_MS = 200;   // poll-driven
    const BUILD_SAVE_TIMEOUT_MS = 12000;  // reduced
    const BUILD_SAVE_MAX_RETRIES = 12;  // more retries, faster polling
    const BUILD_SAVE_STORAGE_HERO_ID = "hero_skyrunner";
    const BUILD_SAVE_RETURN_HERO_ID = "hero_werewolf";
    const BUILD_SAVE_STORAGE_SETTLE_DELAY_MS = 300;   // poll-driven
    const BUILD_SAVE_RETURN_DELAY_SEC = 0.3;    // poll-driven
    const BUILD_SAVE_PRE_RESTORE_DELAY_SEC = 0.3;    // poll-driven
    const BUILD_SAVE_CLEAR_REUSE_SKYRUNNER_MAX_AGE_MS = 15000;
    const BUILD_SAVE_STORAGE_CONFIRM_POLL_MS = 200;  // poll-driven (was 50)
    const BUILD_SAVE_STORAGE_CONFIRM_TIMEOUT_MS = 4000;   // reduced
    const BUILD_SAVE_STORAGE_CONFIRM_PROVISIONAL_MIN_RETRIES = 8;
    const BUILD_SAVE_STORAGE_CONFIRM_PROVISIONAL_MIN_ELAPSED_MS = 1000;  // reduced
    const BUILD_SAVE_STORAGE_CONFIRM_PROVISIONAL_REQUIRED_HITS = 2;
    const BUILD_SAVE_STORAGE_CONFIRM_REOPEN_MIN_RETRIES = 6;
    const BUILD_SAVE_STORAGE_CONFIRM_REOPEN_COOLDOWN_MS = 1200;  // reduced
    const BUILD_SAVE_STORAGE_CONFIRM_MAX_REOPEN_ATTEMPTS = 1;
    const BUILD_SAVE_TARGET_LOCK_STABLE_HITS = 3;
    const BUILD_SAVE_TARGET_LOCK_QUIET_MS = 150;  // reduced
    const BUILD_SAVE_TARGET_LOCK_RETRY_DELAY_MS = 80;  // reduced
    const BUILD_SAVE_TARGET_LOCK_MAX_DRIFT_RETRIES = 12;
    const BUILD_SAVE_STORAGE_SIGNATURE_CONFIRM_HITS = 2;
    const BUILD_SAVE_STORAGE_SIGNATURE_SLOT_IDS = [
        "slot_signature_1",
        "slot_signature_2",
        "slot_signature_3"
    ];
    // "*" = any ability present; "" = ignored slot.
    const BUILD_SAVE_STORAGE_SIGNATURE_EXPECTED = [
        "",
        "ability_skyrunner_magic_beam",
        ""
    ];
    const BUILD_SAVE_STORAGE_SIGNATURE_LABELS = [
        "Waiting...",
        "ability_skyrunner_magic_beam",
        "Waiting..."
    ];
    const BUILD_CLEAR_ACTION_DELAY_MS = 60;   // poll-driven
    const BUILD_CLEAR_POST_DELETE_DELAY_MS = 150;  // poll-driven
    const BUILD_CLEAR_POST_SELECT_DELAY_MS = 80;   // poll-driven
    const BUILD_CLEAR_TIMEOUT_MS = 30000;  // reduced
    const BUILD_CLEAR_MAX_RETRIES = 40;  // more retries, faster
    const BUILD_CLEAR_EMPTY_CONFIRM_HITS = 2;
    const BUILD_CLEAR_STORAGE_CONFIRM_POLL_MS = 200; // poll-driven (was 60)
    // (debug infrastructure removed — BUILD_CLEAR_DEBUG, BUILD_SAVE_DEBUG)
    const ENEMY_ULT_OLD_DEBUG = false;
    const ENEMY_ULT_OLD_DEBUG_THROTTLE_MS = 500;
    const HERO_DETECT_DEBUG = false;
    const HERO_RETURN_DEBUG = false;
    const HERO_RETURN_DEBUG_THROTTLE_MS = 350;
    const HERO_SELECT_COMMAND_SCAN_MAX_PANELS = 2500;
    const HERO_PERSISTED_KEY = "__QOL_LAST_KNOWN_PLAYABLE_HERO";
    const HERO_PERSIST_MIN_INTERVAL_MS = 1200;
    const HERO_RESTORE_VERIFY_DELAY_MS = 450;
    const HERO_RESTORE_RETRY_DELAY_MS = 350;
    const HERO_RESTORE_MAX_WAIT_MS = 3200;
    const HERO_RESTORE_MAX_RETRIES = 1;
    const HERO_RESTORE_BLIND_SUCCESS_MS = 800;   // reduced from 1300
    const LANE_PREF_WITH_PARTY_OPTION_ID = "lanepreference_1";
    const LANE_PREF_APPLY_INTERVAL_MS = 650;
    const LANE_PREF_HIDDEN_INTERVAL_MS = 2630;
    const LANE_PREF_SELECTED_INTERVAL_MS = 4870;
    const HERO_SHOP_PANEL_SEARCH_MS = 2470;
    const RECENT_PURCHASE_MAX_ITEMS  = 50;
    // Repeated CSS class names
    const CLASS_OUT_OF_COMBAT = "out_of_combat";
    const CLASS_IN_COMBAT = "inCombat";
    const CLASS_ULTIMATE_UNLOCKED = "UltimateUnlocked";
    const RECENT_PURCHASE_QUICK_FADE_SEC            = 0.4;
    const RECENT_PURCHASE_QUICK_CLASSES = [
        "isTier1Purchase", "isTier2Purchase", "isTier3Purchase", "isTier4Purchase",
        "isWeaponPurchase", "isArmorPurchase", "isTechPurchase",
        "isTeam1Purchase", "isTeam2Purchase"
    ];
    const ZIP_BOOST_SOURCE_SEARCH_MS = 1730;
    // Phase A.2: 16 MC constants removed — already extracted to ql_feat_healthbar.js.

    function AccountProbeLog(msg) {
        if (!ACCOUNT_PROBE_LOG) return;
        $.Msg("[QOLLock][AccountProbe] " + msg);
    }

function ItemMirrorFlashLog(msg) {
    if (!ITEM_MIRROR_FLASH_DEBUG) return;
    $.Msg("[QOLLock][ItemMirrorFlash] " + msg);
}

function ItemMirrorCooldownDebugLog(msg) {
    if (!ITEM_MIRROR_COOLDOWN_DEBUG) return;
    $.Msg("[QOLLock][ItemMirrorCooldown] " + msg);
}

function ItemMirrorCooldownDebugLogThrottled(sig, msg, nowMs) {
    if (!ITEM_MIRROR_COOLDOWN_DEBUG) return;
    var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
    var sameSig = sig && sig === State.itemMirror.debugLastSig;
    if (sameSig && now < (State.itemMirror.debugLastMs || 0)) return;
    State.itemMirror.debugLastSig = sig || "";
    State.itemMirror.debugLastMs = now + ITEM_MIRROR_COOLDOWN_DEBUG_THROTTLE_MS;
    ItemMirrorCooldownDebugLog(msg);
}

function ExpressShotLog(msg) {
    if (!ITEM_MIRROR_EXPRESS_DEBUG) return;
    $.Msg("[QOLLock][ItemExpressShot] " + msg);
    }

    function ItemMirrorExceptionLog(msg) {
        if (!ITEM_MIRROR_EXCEPTION_DEBUG) return;
        $.Msg("[QOLLock][ItemMirrorException] " + msg);
    }

    function UrnTrackerLog(msg) {
        if (!URN_TRACKER_DEBUG) return;
        $.Msg("[QOLLock][UrnTracker] " + msg);
    }

    function StatBonusesDebugLog(msg) {
        if (!STAT_BONUSES_DEBUG) return;
        $.Msg("[QOLLock][StatBonusesDebug] " + msg);
    }

    function StatBonusesDebugLogThrottled(sig, msg, nowMs) {
        if (!STAT_BONUSES_DEBUG) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var sameSig = sig && sig === State.statBonuses.debugLastSig;
        if (sameSig && now < (State.statBonuses.debugNextMs || 0)) return;
        State.statBonuses.debugLastSig = sig || "";
        State.statBonuses.debugNextMs = now + STAT_BONUSES_DEBUG_MIN_INTERVAL_MS;
        StatBonusesDebugLog(msg);
    }

    function HeroReturnDebugLog(msg) {
        if (!HERO_RETURN_DEBUG) return;
        $.Msg("[QOLLock][HeroReturnDebug] " + msg);
    }

    function HeroReturnDebugLogThrottled(sig, msg, nowMs) {
        if (!HERO_RETURN_DEBUG) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var sameSig = sig && sig === State.heroReturnDebugLastSig;
        if (sameSig && now < (State.heroReturnDebugNextMs || 0)) return;
        State.heroReturnDebugLastSig = sig || "";
        State.heroReturnDebugNextMs = now + HERO_RETURN_DEBUG_THROTTLE_MS;
        HeroReturnDebugLog(msg);
    }

    function EnemyColoredHealthDebugLog(msg) {
        if (!ENEMY_COLORED_HEALTH_DEBUG) return;
        $.Msg("[QOLLock][EnemyColoredHealthDebug] " + msg);
    }

    // Phase A.3: EnemyColoredHealthDebugLogThrottled + MinimapCrateOverlayDebugLogThrottled
    // removed — dead code (feature files have their own copies).


    function EnemyUltOldDebugLog(msg) {
        if (!ENEMY_ULT_OLD_DEBUG) return;
        $.Msg("[QOLLock][EnemyUltOldDebug] " + msg);
    }

    function EnemyUltOldDebugLogThrottled(sig, msg, nowMs) {
        if (!ENEMY_ULT_OLD_DEBUG) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var sameSig = sig && sig === State.enemyUltOldDebugLastSig;
        if (sameSig && now < (State.enemyUltOldDebugNextMs || 0)) return;
        State.enemyUltOldDebugLastSig = sig || "";
        State.enemyUltOldDebugNextMs = now + ENEMY_ULT_OLD_DEBUG_THROTTLE_MS;
        EnemyUltOldDebugLog(msg);
    }

    function _TLog(label, detail) {
        try { $.Msg("[QOLLock][TRACE][" + (label || "") + "] " + (detail || "")); } catch(e) { QOL_WARN("core", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
    }

    function SettingsLoaderDebugLog(msg) {
        if (!SETTINGS_LOADER_DEBUG) return;
        $.Msg("[QOLLock][SettingsLoaderDebug] " + msg);
    }

    function SettingsLoaderTraceLog(msg) {
        if (!SETTINGS_LOADER_TRACE) return;
        $.Msg("[QOLLock][SettingsLoaderTrace] " + msg);
    }

    function SettingsLoaderTraceLogThrottled(sig, msg, nowMs) {
        if (!SETTINGS_LOADER_TRACE) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var sameSig = sig && sig === State.settingsLoaderTraceLastSig;
        if (sameSig && now < (State.settingsLoaderTraceNextMs || 0)) return;
        State.settingsLoaderTraceLastSig = sig || "";
        State.settingsLoaderTraceNextMs = now + SETTINGS_LOADER_TRACE_THROTTLE_MS;
        SettingsLoaderTraceLog(msg);
    }

    function SettingsLoaderDebugLogThrottled(sig, msg, nowMs) {
        if (!SETTINGS_LOADER_DEBUG) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var sameSig = sig && sig === State.settingsLoaderDebugLastSig;
        if (sameSig && now < (State.settingsLoaderDebugNextMs || 0)) return;
        State.settingsLoaderDebugLastSig = sig || "";
        State.settingsLoaderDebugNextMs = now + SETTINGS_LOADER_DEBUG_THROTTLE_MS;
        SettingsLoaderDebugLog(msg);
    }

    function SetSettingsLoaderDebugOverlayLine(lineText) {
        if (!SETTINGS_LOADER_DEBUG) return;
        State.settingsLoaderDebugOverlayLine = lineText ? String(lineText) : "";
        State.settingsLoaderLastRenderSig = "";
    }

    function IsSettingsLoaderShopPromptDetail(text) {
        if (!text) return false;
        var lower = String(text).toLowerCase();
        if (lower.indexOf("open your shop") !== -1) return true;
        if (lower.indexOf("open shop") !== -1) return true;
        if (lower.indexOf("potential corrupt save") !== -1) return true;
        if (lower.indexOf("welcome to qol lock") !== -1) return true;
        if (lower.indexOf("press alt+f4") !== -1) return true;
        if (lower.indexOf("let the loader run") !== -1) return true;
        return false;
    }

    function ResolveSettingsThemeId(cfg) {
        var raw = Math.round(Number(cfg && cfg.SETTINGS_THEME));
        if (raw === 1 || raw === 2 || raw === 3 || raw === 4 || raw === 5) return raw;
        return 0;
    }

    function GetSettingsUiThemePalette() {
        var theme = ResolveSettingsThemeId(State.lastConfig || _defCfg);
        if (theme === 1) {
            return {
                overlay: "rgba(246, 229, 194, 0.76)",
                card: "gradient( linear, 0% 0%, 100% 100%, from( rgba(255, 245, 220, 0.990) ), color-stop( 0.58, rgba(236, 214, 175, 0.980) ), to( rgba(211, 181, 132, 0.985) ) )",
                cardBorder: "1px solid rgba(122, 88, 45, 0.20)",
                cardShadow: "fill rgba(94, 65, 31, 0.26) 0px 18px 42px 0px, inset rgba(255, 255, 244, 0.42) 0px 1px 0px 0px",
                title: "#4e331b",
                accent: "#a3692c",
                body: "#62482d",
                warn: "#b64d3f",
                panel: "gradient( linear, 0% 0%, 100% 100%, from( rgba(255, 250, 235, 0.55) ), to( rgba(224, 195, 145, 0.38) ) )"
            };
        }
        if (theme === 2) {
            return {
                overlay: "rgba(58, 18, 45, 0.66)",
                card: "gradient( linear, 0% 0%, 100% 100%, from( rgba(255, 241, 250, 0.995) ), color-stop( 0.58, rgba(250, 197, 228, 0.985) ), to( rgba(238, 173, 209, 0.985) ) )",
                cardBorder: "1px solid rgba(174, 42, 126, 0.22)",
                cardShadow: "fill rgba(118, 45, 92, 0.28) 0px 18px 42px 0px, inset rgba(255, 255, 255, 0.54) 0px 1px 0px 0px",
                title: "#3f1636",
                accent: "#b81c79",
                body: "#3f1636",
                warn: "#8f2430",
                panel: "gradient( linear, 0% 0%, 100% 100%, from( rgba(255, 250, 253, 0.58) ), to( rgba(231, 146, 199, 0.42) ) )"
            };
        }
        if (theme === 3) {
            return {
                overlay: "rgba(2, 2, 3, 0.82)",
                card: "gradient( linear, 0% 0%, 100% 100%, from( rgba(18, 18, 20, 0.990) ), color-stop( 0.58, rgba(8, 8, 10, 0.980) ), to( rgba(3, 3, 5, 0.990) ) )",
                cardBorder: "1px solid rgba(255, 47, 67, 0.20)",
                cardShadow: "fill rgba(0, 0, 0, 0.68) 0px 18px 42px 0px, inset rgba(255, 47, 67, 0.08) 0px 1px 0px 0px",
                title: "#f6f2f3",
                accent: "#ff3045",
                body: "#c7b9bd",
                warn: "#ff3045",
                panel: "gradient( linear, 0% 0%, 100% 100%, from( rgba(44, 15, 18, 0.42) ), to( rgba(13, 13, 15, 0.36) ) )"
            };
        }
        if (theme === 4) {
            return {
                overlay: "rgba(7, 33, 50, 0.68)",
                card: "gradient( linear, 0% 0%, 100% 100%, from( rgba(24, 62, 82, 0.985) ), color-stop( 0.58, rgba(14, 39, 56, 0.975) ), to( rgba(8, 22, 36, 0.985) ) )",
                cardBorder: "1px solid rgba(108, 214, 255, 0.18)",
                cardShadow: "fill rgba(0, 18, 31, 0.52) 0px 18px 42px 0px, inset rgba(151, 226, 255, 0.10) 0px 1px 0px 0px",
                title: "#effcff",
                accent: "#72d7ff",
                body: "#caedf5",
                warn: "#ffb6a8",
                panel: "gradient( linear, 0% 0%, 100% 100%, from( rgba(52, 117, 145, 0.40) ), to( rgba(8, 31, 47, 0.34) ) )"
            };
        }
        if (theme === 5) {
            return {
                overlay: "rgba(233, 236, 232, 0.72)",
                card: "gradient( linear, 0% 0%, 100% 100%, from( rgba(250, 252, 247, 0.995) ), color-stop( 0.58, rgba(225, 229, 220, 0.985) ), to( rgba(201, 208, 197, 0.985) ) )",
                cardBorder: "1px solid rgba(45, 52, 49, 0.18)",
                cardShadow: "fill rgba(64, 70, 66, 0.24) 0px 18px 42px 0px, inset rgba(255, 255, 255, 0.65) 0px 1px 0px 0px",
                title: "#17201c",
                accent: "#00a26a",
                body: "#2c3834",
                warn: "#c63d35",
                panel: "gradient( linear, 0% 0%, 100% 100%, from( rgba(255, 255, 255, 0.58) ), to( rgba(204, 216, 207, 0.42) ) )"
            };
        }
        return {
            overlay: "rgba(3, 5, 6, 0.64)",
            card: "gradient( linear, 0% 0%, 100% 100%, from( rgba(24, 29, 29, 0.985) ), color-stop( 0.56, rgba(12, 15, 15, 0.970) ), to( rgba(8, 10, 11, 0.985) ) )",
            cardBorder: "1px solid rgba(210, 224, 216, 0.075)",
            cardShadow: "fill rgba(0, 0, 0, 0.56) 0px 18px 42px 0px, inset rgba(166, 246, 184, 0.05) 0px 1px 0px 0px",
            title: "#f2faf5",
            accent: "#9af0bd",
            body: "#bac6c0",
            warn: "#ff9d9d",
            panel: "gradient( linear, 0% 0%, 100% 100%, from( rgba(31, 34, 36, 0.42) ), to( rgba(12, 14, 15, 0.30) ) )"
        };
    }

    function ApplyLoaderDetailPromptStyle(detailLabel, isPrompt) {
        if (!detailLabel) return;
        var prompt = (isPrompt === true);
        var theme = GetSettingsUiThemePalette();
        if (detailLabel.SetHasClass) detailLabel.SetHasClass("is-shop-prompt", prompt);
        if (prompt) {
            detailLabel.style.fontSize = "14px";
            detailLabel.style.lineHeight = "20px";
            detailLabel.style.fontWeight = "semi-bold";
            detailLabel.style.color = theme.warn;
            detailLabel.style.textShadow = "0px 0px 7px rgba(255, 126, 126, 0.13)";
        } else {
            detailLabel.style.fontSize = "13px";
            detailLabel.style.lineHeight = "19px";
            detailLabel.style.fontWeight = "normal";
            detailLabel.style.color = theme.body;
            detailLabel.style.textShadow = "none";
        }
    }

    function ApplyLoaderCardTheme(card) {
        if (!card || !card.style) return;
        var theme = GetSettingsUiThemePalette();
        card.style.horizontalAlign = "center";
        card.style.verticalAlign = "top";
        card.style.flowChildren = "down";
        card.style.marginTop = "30px";
        card.style.width = "1040px";
        card.style.maxWidth = "92%";
        card.style.paddingTop = "18px";
        card.style.paddingRight = "20px";
        card.style.paddingBottom = "18px";
        card.style.paddingLeft = "20px";
        card.style.backgroundColor = theme.card;
        card.style.border = theme.cardBorder;
        card.style.borderRadius = "5px";
        card.style.boxShadow = theme.cardShadow;
    }

    function ApplyLoaderWarningTheme(warning) {
        if (!warning || !warning.style) return;
        var theme = GetSettingsUiThemePalette();
        warning.style.horizontalAlign = "center";
        warning.style.fontFamily = "oracle";
        warning.style.marginBottom = "10px";
        warning.style.fontSize = "14px";
        warning.style.fontWeight = "semi-bold";
        warning.style.letterSpacing = "1.0px";
        warning.style.color = theme.warn;
        warning.style.textShadow = "0px 0px 7px rgba(255, 126, 126, 0.14)";
        warning.style.textTransform = "uppercase";
    }

    function ApplyLoaderTitleTheme(title) {
        if (!title || !title.style) return;
        var theme = GetSettingsUiThemePalette();
        title.style.horizontalAlign = "center";
        title.style.fontFamily = "oracle";
        title.style.fontSize = "28px";
        title.style.fontWeight = "semi-bold";
        title.style.letterSpacing = "1.8px";
        title.style.color = theme.title;
        title.style.textShadow = "0px 0px 9px rgba(152, 255, 181, 0.12)";
        title.style.marginBottom = "12px";
        title.style.textTransform = "uppercase";
    }

    function ApplyLoaderDetailTheme(detailLabel) {
        if (!detailLabel || !detailLabel.style) return;
        var theme = GetSettingsUiThemePalette();
        detailLabel.style.width = "100%";
        detailLabel.style.marginTop = "12px";
        detailLabel.style.fontFamily = "oracle";
        detailLabel.style.fontSize = "13px";
        detailLabel.style.lineHeight = "19px";
        detailLabel.style.letterSpacing = "0.18px";
        detailLabel.style.color = theme.body;
        detailLabel.style.textShadow = "none";
    }

    function ApplyLoaderStepsWrapTheme(stepsWrap) {
        if (!stepsWrap || !stepsWrap.style) return;
        var theme = GetSettingsUiThemePalette();
        stepsWrap.style.width = "100%";
        stepsWrap.style.flowChildren = "down";
        stepsWrap.style.padding = "8px 10px 8px 10px";
        stepsWrap.style.border = theme.cardBorder;
        stepsWrap.style.borderRadius = "4px";
        stepsWrap.style.backgroundColor = theme.panel;
        stepsWrap.style.boxShadow = "inset rgba(0, 0, 0, 0.26) 0px 1px 5px 0px";
    }

    function ApplyLoaderStepRowTheme(row) {
        if (!row || !row.style) return;
        row.style.flowChildren = "right";
        row.style.width = "100%";
        row.style.minHeight = "30px";
        row.style.marginTop = "1px";
        row.style.padding = "2px 4px 2px 4px";
        row.style.borderRadius = "3px";
    }

    function ApplyLoaderStepIconTheme(icon) {
        if (!icon || !icon.style) return;
        icon.style.width = "19px";
        icon.style.height = "19px";
        icon.style.marginRight = "9px";
        icon.style.verticalAlign = "center";
    }

    function ApplyLoaderStepLabelTheme(label) {
        if (!label || !label.style) return;
        label.style.verticalAlign = "center";
        label.style.fontFamily = "oracle";
        label.style.fontSize = "14px";
        label.style.lineHeight = "19px";
        label.style.letterSpacing = "0.55px";
        label.style.textShadow = "none";
    }

    function DecorateLoaderDetailWithSpinner(detailText, nowMs, isSessionActive, isSessionCompleted) {
        var text = detailText ? String(detailText) : "";
        if (!text || !isSessionActive || isSessionCompleted) return text;
        var frames = LOADER_DETAIL_SPINNER_FRAMES;
        if (!frames || frames.length < 1) return text;
        var frameMs = Number(LOADER_DETAIL_SPINNER_FRAME_MS);
        if (!isFinite(frameMs) || frameMs < 40) frameMs = 180;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var frameIndex = Math.floor(now / frameMs) % frames.length;
        if (frameIndex < 0) frameIndex = 0;
        return String(frames[frameIndex]) + " " + text;
    }

    function SettingsLoaderBuildProbeSnapshot(root) {
        var shopOpen = false;
        try { shopOpen = !!IsHudClassActive(root, "gShopOpen"); } catch (e0) { shopOpen = false; }

        var selectedBuild = null;
        try {
            selectedBuild = root && root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD) : null;
        } catch (e1) {
            selectedBuild = null;
        }
        var hasSelectedBuild = !!selectedBuild;
        var categoryCount = 0;
        try { categoryCount = selectedBuild ? QOL.countBuildCategoryHeaders(selectedBuild) : 0; } catch (e2) { categoryCount = 0; }

        var selectedTitle = "";
        try { selectedTitle = String(TryReadSelectedBuildTitleText(root, selectedBuild) || ""); } catch (e3) { selectedTitle = ""; }
        if (selectedTitle.length > 48) selectedTitle = selectedTitle.slice(0, 48) + "...";
        if (!selectedTitle || selectedTitle.length === 0) selectedTitle = "-";

        var signal = { hero: "", source: "none" };
        try { signal = ResolveBuildSaveStorageHeroSignal(root) || signal; } catch (e4) { signal = { hero: "", source: "none" }; }
        var signalHero = "";
        try { signalHero = QOL.normalizeHeroId(signal.hero); } catch (e5) { signalHero = ""; }
        var signalSource = signal && signal.source ? String(signal.source) : "none";

        return "shopOpen=" + (shopOpen ? "1" : "0") +
            " selectedBuild=" + (hasSelectedBuild ? "1" : "0") +
            " categories=" + String(categoryCount) +
            " title=\"" + selectedTitle + "\"" +
            " signalHero=" + (signalHero || "-") +
            " signalSource=" + signalSource;
    }

    function TraceSettingsLoaderProbeHeartbeat(root, accountId, nowMs, reason) {
        if (!SETTINGS_LOADER_TRACE) return;
        var stage = State.buildCategoryPayloadHeroProbeStage ? String(State.buildCategoryPayloadHeroProbeStage) : "-";
        var nextMs = Number(State.buildCategoryPayloadHeroProbeNextMs) || 0;
        var waitMs = nextMs > nowMs ? (nextMs - nowMs) : 0;
        var traceReason = reason ? String(reason) : "tick";
        var snapshot = SettingsLoaderBuildProbeSnapshot(root);
        SettingsLoaderTraceLogThrottled(
            "probe|" + (accountId || "-") + "|" + stage + "|" + traceReason,
            "account=" + (accountId || "-") +
                " stage=" + stage +
                " step=" + (State.settingsLoaderCurrentStep || "-") +
                " reason=" + traceReason +
                " waitMs=" + String(waitMs) +
                " switchRetries=" + String(Number(State.buildCategoryPayloadHeroProbeSwitchRetries) || 0) +
                " misses=" + String(Number(State.buildCategoryPayloadHeroProbeMisses) || 0) +
                " confirmHits=" + String(Number(State.buildCategoryPayloadStorageConfirmHits) || 0) +
                " headerConfirmed=" + (State.buildCategoryPayloadSkyrunnerHeaderConfirmed ? "1" : "0") +
                " " + snapshot,
            nowMs
        );
    }
    const HERO_DETECT_ALIAS_MAP = {
        // Internal storage hero used by save/load flow.
        airheart: 1,
        inferno: 1,
        gigawatt: 1,
        hornet: 1,
        ghost: 1,
        atlas: 1,
        wraith: 1,
        forge: 1,
        chrono: 1,
        dynamo: 1,
        kelvin: 1,
        haze: 1,
        astro: 1,
        bebop: 1,
        nano: 1,
        orion: 1,
        krill: 1,
        shiv: 1,
        tengu: 1,
        kali: 1,
        warden: 1,
        yamato: 1,
        lash: 1,
        viscous: 1,
        gunslinger: 1,
        yakuza: 1,
        genericperson: 1,
        tokamak: 1,
        wrecker: 1,
        rutger: 1,
        synth: 1,
        thumper: 1,
        mirage: 1,
        slork: 1,
        cadence: 1,
        targetdummy: 1,
        bomber: 1,
        shieldguy: 1,
        viper: 1,
        vandal: 1,
        magician: 1,
        trapper: 1,
        operative: 1,
        vampirebat: 1,
        drifter: 1,
        priest: 1,
        frank: 1,
        bookworm: 1,
        boho: 1,
        doorman: 1,
        skyrunner: 1,
        swan: 1,
        punkgoat: 1,
        fortuna: 1,
        necro: 1,
        fencer: 1,
        druid: 1,
        graf: 1,
        opera: 1,
        familiar: 1,
        werewolf: 1,
        unicorn: 1
    };

    function ResolvePlayableHeroAlias(rawAlias) {
        if (!rawAlias) return "";
        var alias = String(rawAlias).toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (!alias) return "";
        if (alias.indexOf("hero_") === 0) alias = alias.slice(5);
        if (alias.indexOf("cut_") === 0) alias = alias.slice(4);
        if (alias.indexOf("npc_") === 0) alias = alias.slice(4);
        if (!alias) return "";
        if (HERO_DETECT_ALIAS_MAP[alias]) return alias;

        // Common variant suffixes seen in model/asset names (e.g. yamato_v2).
        var variant = alias
            .replace(/_v[0-9]+$/i, "")
            .replace(/_[0-9]+$/i, "")
            .replace(/_(staging|wip|test|preview|prototype|dev)$/i, "");
        if (variant && HERO_DETECT_ALIAS_MAP[variant]) return variant;

        // Progressive trim for composite aliases: foo_bar_baz -> foo_bar -> foo.
        var parts = alias.split("_");
        while (parts.length > 1) {
            parts.pop();
            var candidate = parts.join("_");
            if (candidate && HERO_DETECT_ALIAS_MAP[candidate]) return candidate;
        }

        return "";
    }

    function NormalizeHeroAliasToken(aliasText) {
        var alias = ResolvePlayableHeroAlias(aliasText);
        if (!alias) return "";
        return "hero_" + alias;
    }

    function ExtractHeroTokenFromText(rawText) {
        if (!rawText) return "";
        var text = String(rawText);

        // Highest-confidence path: canonical internal name token.
        var canonical = text.match(/\b(hero_[a-z0-9_]+)\b/i);
        if (canonical && canonical[1]) return String(canonical[1]).toLowerCase();

        // Fallback for hero image/resource paths that often omit the hero_ prefix.
        var aliasPatterns = [
            /\/heroes\/([a-z0-9_]+)(?:[\/._-]|$)/i,
            /\/heroes(?:[_-][a-z0-9]+)\/([a-z0-9_]+)(?:[\/._-]|$)/i,
            /\/heroes(?:[_-][a-z0-9]+)\/([a-z0-9_]+)\/(?:materials|textures|models|abilities)(?:[\/._-]|$)/i,
            /\/heroes_(?:staging|wip)\/([a-z0-9_]+)(?:[\/._-]|$)/i,
            /\/hero_portraits\/([a-z0-9_]+)(?:[\/._-]|$)/i,
            /\/heroes?\/(?:hero_)?([a-z0-9_]+)\.vmdl(?:_c)?\b/i,
            /\bselected[_:\- ]*hero[_:= ]+([a-z0-9_]+)\b/i,
            /\bhero[_:\-/ ]+([a-z0-9_]+)\b/i
        ];
        for (var i = 0; i < aliasPatterns.length; i++) {
            var m = text.match(aliasPatterns[i]);
            if (!m || !m[1]) continue;
            var heroToken = NormalizeHeroAliasToken(m[1]);
            if (heroToken) return heroToken;
        }

        // Language-agnostic fallback: use locale lookup table (generated from
        // Deadlock's localization files) to resolve translated hero names.
        if (typeof QOL !== "undefined" && typeof QOL.lookupLocaleHero === "function") {
            var localeHero = QOL.lookupLocaleHero(rawText);
            if (localeHero) return localeHero;
        }

        return "";
    }

    function ExtractLastHeroTokenFromText(rawText) {
        if (!rawText) return "";
        var text = String(rawText);
        var re = /\b(hero_[a-z0-9_]+)\b/ig;
        var match = null;
        var last = "";
        while ((match = re.exec(text)) !== null) {
            if (match[1]) last = String(match[1]).toLowerCase();
        }
        if (!last) {
            var fallback = ExtractHeroTokenFromText(text);
            if (fallback) last = fallback;
        }
        return last;
    }

    function ExtractHeroFromLooseAliasTokens(rawText) {
        if (!rawText) return "";
        var text = String(rawText).toLowerCase();
        if (!text || text.length === 0) return "";

        var parts = text.split(/[^a-z0-9]+/);
        for (var i = 0; i < parts.length; i++) {
            var token = parts[i];
            if (!token || token.length < 3) continue;
            var alias = ResolvePlayableHeroAlias(token);
            if (alias) return "hero_" + alias;
        }
        return "";
    }

    function TryReadHeroFromPanelBHasClass(panel) {
        if (!panel || !panel.BHasClass) return "";
        for (var alias in HERO_DETECT_ALIAS_MAP) {
            if (!alias) continue;
            try {
                if (panel.BHasClass("hero_" + alias)) return "hero_" + alias;
            } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
            try {
                if (panel.BHasClass(alias)) return "hero_" + alias;
            } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        }
        return "";
    }

    function PanelLooksSelected(panel) {
        if (!panel) return false;
        var classText = "";
        try {
            if (panel.GetAttributeString) classText = String(panel.GetAttributeString("class", "") || "");
        } catch (e0) {
            classText = "";
        }
        if (!classText || classText.length === 0) {
            try {
                if (panel.GetClasses) classText = String(panel.GetClasses() || "");
            } catch (e1) {
                classText = "";
            }
        }
        var normalized = classText.toLowerCase();
        if (!normalized || normalized.length === 0) return false;
        if (/(^|[\s,_-])(selected|active|current|isselected|is_active)([\s,_-]|$)/.test(normalized)) return true;
        return false;
    }

    function GetLoaderBaseDefaultHeroId() {
        var defaults = _BDC();
        var rawHero = (defaults && defaults.hasOwnProperty("DEFAULT_HERO"))
            ? String(defaults.DEFAULT_HERO || "")
            : "";
        var normalized = QOL.normalizeHeroId(rawHero);
        if (normalized && normalized !== BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID) return normalized;
        var fallback = QOL.normalizeHeroId(BUILD_SAVE_RETURN_HERO_ID);
        if (fallback && fallback !== BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID) return fallback;
        return "hero_werewolf";
    }
    function ReadPanelClassTextMaybe(panel) {
        if (!panel) return "";
        var classText = "";
        try {
            if (panel.GetAttributeString) classText = String(panel.GetAttributeString("class", "") || "");
        } catch (e0) {
            classText = "";
        }
        if (!classText || classText.length === 0) {
            try {
                if (panel.GetClasses) classText = String(panel.GetClasses() || "");
            } catch (e1) {
                classText = "";
            }
        }
        return classText || "";
    }

    function ReadPanelTypeTextMaybe(panel) {
        if (!panel) return "";
        var typeText = "";
        try { if (panel.paneltype !== undefined && panel.paneltype !== null) typeText = String(panel.paneltype); } catch (e0) { typeText = ""; }
        if (!typeText || typeText.length === 0) {
            try { if (panel.type !== undefined && panel.type !== null) typeText = String(panel.type); } catch (e1) { typeText = ""; }
        }
        if (!typeText || typeText.length === 0) {
            try { if (panel.panelType !== undefined && panel.panelType !== null) typeText = String(panel.panelType); } catch (e2) { typeText = ""; }
        }
        return typeText || "";
    }

    function ReadPanelIdTextMaybe(panel) {
        if (!panel) return "";
        var idText = "";
        try { idText = panel.id ? String(panel.id) : ""; } catch (e0) { idText = ""; }
        return idText || "";
    }

    function TryReadHeroFromPanelDetails(panel) {
        if (!panel) return "";
        function parseTextCandidate(raw) {
            if (!raw) return "";
            return QOL.normalizeHeroId(
                ExtractHeroTokenFromText(raw) ||
                NormalizeHeroAliasToken(raw) ||
                ExtractHeroFromLooseAliasTokens(raw)
            );
        }

        var directCandidates = [
            ReadPanelClassTextMaybe(panel),
            ReadPanelIdTextMaybe(panel),
            ReadPanelTypeTextMaybe(panel),
            ReadPanelTextMaybe(panel)
        ];
        for (var i = 0; i < directCandidates.length; i++) {
            var parsed = parseTextCandidate(directCandidates[i]);
            if (parsed) return parsed;
        }

        var parsedFromClassMembership = QOL.normalizeHeroId(TryReadHeroFromPanelBHasClass(panel));
        if (parsedFromClassMembership) return parsedFromClassMembership;

        if (panel.GetAttributeString) {
            var attrKeys = [
                "hero_name",
                "hero_internal_name",
                "hero",
                "current_hero",
                "src",
                "image",
                "style",
                "value",
                "text",
                "onactivate",
                "onmouseover"
            ];
            for (var a = 0; a < attrKeys.length; a++) {
                var attrVal = "";
                try { attrVal = String(panel.GetAttributeString(attrKeys[a], "") || ""); } catch (e0) { attrVal = ""; }
                if (!attrVal || attrVal.length === 0) continue;
                var parsedAttr = parseTextCandidate(attrVal);
                if (parsedAttr) return parsedAttr;
            }
        }

        // NOTE: panel.style.image is NOT queried — Panorama doesn't support
        // "image" as a CSS property, so it always throws. Skipped intentionally.
        try {
            if (panel.style) {
                var styleBg = String(panel.style.backgroundImage || "");
                var parsedStyleBg = parseTextCandidate(styleBg);
                if (parsedStyleBg) return parsedStyleBg;
            }
        } catch(e2) { QOL_WARN("core", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }

        var parent = panel;
        for (var depth = 0; depth < 4; depth++) {
            try { parent = parent && parent.GetParent ? parent.GetParent() : null; } catch (e3) { parent = null; }
            if (!parent) break;
            var parentCombined = ReadPanelClassTextMaybe(parent) + " " + ReadPanelIdTextMaybe(parent) + " " + ReadPanelTypeTextMaybe(parent);
            var parsedParent = parseTextCandidate(parentCombined);
            if (parsedParent) return parsedParent;
        }

        return "";
    }

    function TryReadHeroFromPanelSubtree(panel, maxNodes) {
        if (!panel) return "";
        var limit = Number(maxNodes) || 0;
        if (limit <= 0) limit = 80;

        var stack = [panel];
        var scanned = 0;
        while (stack.length > 0 && scanned < limit) {
            var current = stack.pop();
            if (!current) continue;
            scanned++;

            var hero = TryReadHeroFromPanelDetails(current);
            if (hero) return hero;

            var childCount = 0;
            try { childCount = current.GetChildCount ? current.GetChildCount() : 0; } catch (e0) { childCount = 0; }
            for (var i = 0; i < childCount; i++) {
                var child = null;
                try { child = current.GetChild(i); } catch (e1) { child = null; }
                if (child) stack.push(child);
            }
        }
        return "";
    }
    function LogLoopException(loopName, err, stateKey, nowMs) {
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var key = stateKey || "loopErrorNextLogMs";
        var nextLogMs = Number(State[key]) || 0;
        if (now < nextLogMs) return;
        State[key] = now + LOOP_ERROR_LOG_INTERVAL_MS;
        var msg = "unknown";
        if (err && err.message) msg = String(err.message);
        else if (err !== undefined && err !== null) msg = String(err);
        var stack = (err && err.stack) ? ("\n" + String(err.stack)) : "";
        QOL_ERROR(loopName, msg + stack);
    }

    // ---- Feature Error Isolation (Fix 6) ----

    var FEATURE_ERROR_STREAK_MAX = 10;

    function ResetFeatureErrorStreak(featureName) {
        if (!State.featureErrorStreaks) State.featureErrorStreaks = {};
        State.featureErrorStreaks[featureName] = 0;
    }

    function IncrementFeatureErrorStreak(featureName) {
        if (!State.featureErrorStreaks) State.featureErrorStreaks = {};
        var streak = (Number(State.featureErrorStreaks[featureName]) || 0) + 1;
        State.featureErrorStreaks[featureName] = streak;
        return streak;
    }

    // Phase H: Auto-disable recovery — features re-enable after cooldown.
    var FEATURE_AUTO_DISABLE_COOLDOWN_MS = 30000; // 30 seconds

    function IsFeatureAutoDisabled(featureName) {
        if (!State.featureAutoDisabled) State.featureAutoDisabled = {};
        if (!State.featureAutoDisabledAt) State.featureAutoDisabledAt = {};
        if (!State.featureAutoDisabled[featureName]) return false;
        // Check if cooldown has expired — if so, try re-enabling.
        var disabledAt = State.featureAutoDisabledAt[featureName] || 0;
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        if (disabledAt > 0 && (nowMs - disabledAt) >= FEATURE_AUTO_DISABLE_COOLDOWN_MS) {
            State.featureAutoDisabled[featureName] = false;
            State.featureAutoDisabledAt[featureName] = 0;
            ResetFeatureErrorStreak(featureName);
            QOL_WARN(featureName, "re-enabled after auto-disable cooldown (" + (FEATURE_AUTO_DISABLE_COOLDOWN_MS / 1000) + "s)");
            // Remove from QOL.autoDisabledFeatures list.
            if (QOL.autoDisabledFeatures) {
                var idx = QOL.autoDisabledFeatures.indexOf(featureName);
                if (idx !== -1) QOL.autoDisabledFeatures.splice(idx, 1);
            }
            return false;
        }
        return true;
    }

    function AutoDisableFeature(featureName) {
        if (!State.featureAutoDisabled) State.featureAutoDisabled = {};
        if (!State.featureAutoDisabledAt) State.featureAutoDisabledAt = {};
        State.featureAutoDisabled[featureName] = true;
        State.featureAutoDisabledAt[featureName] = Date.now ? Date.now() : (new Date()).getTime();
        QOL_WARN(featureName, "auto-disabled after " + FEATURE_ERROR_STREAK_MAX + " consecutive errors (re-enables in " + (FEATURE_AUTO_DISABLE_COOLDOWN_MS / 1000) + "s)");
        // Phase A.1: Publish to QOL namespace so settings UI can surface warnings.
        if (!QOL.autoDisabledFeatures) QOL.autoDisabledFeatures = [];
        if (QOL.autoDisabledFeatures.indexOf(featureName) === -1) {
            QOL.autoDisabledFeatures.push(featureName);
        }
    }

    /**
     * Execute a feature tick function with its own error isolation.
     * If the feature throws, the error is logged with the feature name.
     * After 10 consecutive errors, the feature is auto-disabled for the session.
     */
    function ExecuteFeature(featureName, fn) {
        if (IsFeatureAutoDisabled(featureName)) return;
        var _t = PerfNowMs();
        try {
            fn();
            TimeFeature(featureName, _t);
            // Successful execution resets the error streak
            ResetFeatureErrorStreak(featureName);
        } catch (featureErr) {
            LogLoopException(featureName, featureErr, "featureErr_" + featureName, PerfNowMs());
            var streak = IncrementFeatureErrorStreak(featureName);
            // Phase 7.4: Escalate warnings before auto-disable.
            if (streak === 3) {
                QOL_WARN(featureName, streak + " consecutive errors — will auto-disable at " + FEATURE_ERROR_STREAK_MAX);
            } else if (streak === 5) {
                QOL_ERROR(featureName, streak + " consecutive errors — auto-disable imminent at " + FEATURE_ERROR_STREAK_MAX);
            }
            if (streak >= FEATURE_ERROR_STREAK_MAX) {
                AutoDisableFeature(featureName);
            }
        }
    }

    function RuntimeSchedulerGetStore() {
        var store = State.runtimeTaskNextMs;
        if (!store || typeof store !== "object") {
            store = {};
            State.runtimeTaskNextMs = store;
        }
        return store;
    }

    function RuntimeSchedulerNowMs(nowMs) {
        var now = Number(nowMs);
        if (isFinite(now) && now > 0) return now;
        return Date.now ? Date.now() : (new Date()).getTime();
    }

    function RuntimeTaskIsDue(taskKey, nowMs) {
        if (!taskKey) return true;
        var now = RuntimeSchedulerNowMs(nowMs);
        var store = RuntimeSchedulerGetStore();
        var nextMs = Number(store[taskKey]) || 0;
        return now >= nextMs;
    }

    function RuntimeTaskSetDelay(taskKey, nowMs, delayMs) {
        if (!taskKey) return;
        var now = RuntimeSchedulerNowMs(nowMs);
        var delay = Number(delayMs);
        if (!isFinite(delay) || delay < 0) delay = 0;
        var store = RuntimeSchedulerGetStore();
        store[taskKey] = now + delay;
    }

    function RuntimeTaskConsume(taskKey, nowMs, intervalMs) {
        if (!taskKey) return true;
        if (!RuntimeTaskIsDue(taskKey, nowMs)) return false;
        RuntimeTaskSetDelay(taskKey, nowMs, intervalMs);
        return true;
    }

    function RuntimeTaskReset(taskKey) {
        if (!taskKey) return;
        var store = RuntimeSchedulerGetStore();
        if (store.hasOwnProperty(taskKey)) {
            delete store[taskKey];
        }
    }

    function PerfNowMs() {
        return Date.now ? Date.now() : (new Date()).getTime();
    }

    // Module-level cache of State.perfEnabled — avoids repeated property lookups
    // across 70+ PerfStart/PerfEnd calls per tick when perf tracking is off.
    var _perfTrackingActive = false;

    function PerfRecord(name, elapsedMs) {
        if (!_perfTrackingActive) return;
        if (!name) return;
        var ms = Number(elapsedMs);
        if (!isFinite(ms) || ms < 0) return;
        var stats = State.perfStats || {};
        var entry = stats[name];
        if (!entry) {
            entry = { count: 0, total: 0, max: 0, slow: 0 };
            stats[name] = entry;
        }
        entry.count += 1;
        entry.total += ms;
        if (ms > entry.max) entry.max = ms;
        if (ms >= PERF_DEBUG_SLOW_MS) entry.slow += 1;
        State.perfStats = stats;
    }

    function PerfStart() {
        if (!_perfTrackingActive) return 0;
        return PerfNowMs();
    }

    function PerfEnd(name, startMs) {
        if (!_perfTrackingActive || !startMs) return;
        PerfRecord(name, PerfNowMs() - startMs);
    }

    function ResetPerfWindow(nowMs) {
        State.perfStats = {};
        State.perfWindowStartMs = nowMs;
        State.perfNextFlushMs = nowMs + PERF_DEBUG_FLUSH_MS;
        State.perfLoopCount = 0;
        State.perfCompassLoopCount = 0;
    }

    function UpdatePerfEnabledFromConfig(cfg) {
        var enabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_PERF_DEBUG"));
        var detailed = !!(enabled && IsCfgEnabled(cfg, "ENABLE_PERF_DEBUG_DETAIL"));
        _perfTrackingActive = enabled;
        if (!enabled) {
            if (State.perfEnabled) {
                QOL_INFO("Perf", "disabled");
            }
            State.perfEnabled = false;
            State.perfDetailed = false;
            State.perfStats = {};
            State.perfWindowStartMs = 0;
            State.perfNextFlushMs = 0;
            State.perfLoopCount = 0;
            State.perfCompassLoopCount = 0;
            State.manifestPerfSnapPrev = null;
            State.manifestPerfWindow = null;
            return;
        }
        if (!State.perfEnabled) {
            var nowMs = PerfNowMs();
            State.perfEnabled = true;
            State.perfDetailed = detailed;
            ResetPerfWindow(nowMs);
            QOL_INFO("Perf", "enabled (detail=" + (detailed ? "on" : "off") + ")");
            return;
        }
        if (State.perfDetailed !== detailed) {
            State.perfDetailed = detailed;
            QOL_INFO("Perf", "detail " + (detailed ? "enabled" : "disabled"));
        }
    }

    function FlushPerfIfNeeded(force) {
        if (!_perfTrackingActive) return;
        var nowMs = PerfNowMs();
        if (!force && nowMs < (State.perfNextFlushMs || 0)) return;

        var windowStart = State.perfWindowStartMs || nowMs;
        var windowMs = Math.max(1, nowMs - windowStart);
        var stats = State.perfStats || {};

        // ── Merge manifest perf into the same rolling window ──
        // createPollLoop() in ql_scheduler.js records to a lifetime accumulator
        // (_timings → State.manifestPerfStats). Compute per-window deltas against
        // the previous snapshot and merge into stats so manifests appear in the
        // main summary line alongside dispatch PerfRecord entries.
        var mfStats = null;
        try { if (typeof QOL !== "undefined" && QOL.state) { mfStats = QOL.state.manifestPerfStats; } } catch(e) {}
        if (mfStats) {
            var mfPrev = (typeof State.manifestPerfSnapPrev === "object" && State.manifestPerfSnapPrev) || {};
            var mfKeys = Object.keys(mfStats);
            for (var mk = 0; mk < mfKeys.length; mk++) {
                var mkKey = mfKeys[mk];
                var cur = mfStats[mkKey];
                var prev = mfPrev[mkKey];
                if (!cur || cur.count <= 0) continue;
                var dCount = prev ? cur.count - prev.count : cur.count;
                var dTotal = prev ? cur.total - prev.total : cur.total;
                if (dCount <= 0) continue;
                var wMax = cur.max;
                // Merge into stats with "mf." prefix so manifest entries are
                // distinguishable from dispatch loop features.
                var statKey = "mf." + mkKey;
                if (!stats[statKey]) { stats[statKey] = { total: 0, count: 0, max: 0, slow: 0 }; }
                stats[statKey].total += dTotal;
                stats[statKey].count += dCount;
                if (wMax > stats[statKey].max) stats[statKey].max = wMax;
            }
            // Persist snapshot as baseline for next window.
            var mfSnap = {};
            for (var mk2 = 0; mk2 < mfKeys.length; mk2++) {
                var k2 = mfKeys[mk2];
                var s = mfStats[k2];
                if (s) mfSnap[k2] = { count: s.count, total: s.total, max: s.max };
            }
            State.manifestPerfSnapPrev = mfSnap;
            // Publish window data so the perf overlay can read rolling-window
            // values instead of lifetime-accumulated totals.
            State.manifestPerfWindow = mfWindow;
        } else {
            // No manifest stats at all — clear the window so overlay doesn't show stale data.
            State.manifestPerfWindow = null;
        }

        var keys = Object.keys(stats);

        keys.sort(function(a, b) {
            return (stats[b].total - stats[a].total);
        });

        var topCount = Math.min(PERF_DEBUG_TOP_COUNT, keys.length);
        var parts = [];
        for (var i = 0; i < topCount; i++) {
            var key = keys[i];
            var entry = stats[key];
            if (!entry || entry.count <= 0) continue;
            var avg = entry.total / entry.count;
            parts.push(
                key + "=" +
                "avg:" + avg.toFixed(2) + "ms" +
                ",max:" + entry.max.toFixed(2) + "ms" +
                ",n:" + entry.count +
                ",slow:" + entry.slow
            );
        }

        var loopHz = ((State.perfLoopCount * 1000) / windowMs).toFixed(1);
        var compassHz = ((State.perfCompassLoopCount * 1000) / windowMs).toFixed(1);
        var summary = parts.length > 0 ? parts.join(" | ") : "no samples";

        $.Msg(
            "[QOLLock][Perf] window=" + windowMs + "ms" +
            " loopHz=" + loopHz +
            " compassHz=" + compassHz +
            " top=" + summary
        );

        if (State.perfDetailed && keys.length > topCount) {
            var extra = [];
            for (var j = topCount; j < keys.length; j++) {
                var keyExtra = keys[j];
                var entryExtra = stats[keyExtra];
                if (!entryExtra || entryExtra.count <= 0) continue;
                var avgExtra = entryExtra.total / entryExtra.count;
                extra.push(
                    keyExtra + "=" +
                    "avg:" + avgExtra.toFixed(2) + "ms" +
                    ",max:" + entryExtra.max.toFixed(2) + "ms" +
                    ",n:" + entryExtra.count
                );
            }
            if (extra.length > 0) {
                $.Msg("[QOLLock][Perf][detail] " + extra.join(" | "));
            }
        }

        ResetPerfWindow(nowMs);
    }

    const ACCOUNT_PRESET_BINDINGS = (typeof QOL_ACCOUNT_PRESET_BINDINGS === "object" && QOL_ACCOUNT_PRESET_BINDINGS)
        ? QOL_ACCOUNT_PRESET_BINDINGS
        : {};

    // Explicit class exclusions for classless Express Shot detection.
    // Keep this list easy to tune while validating in live matches.
    const EXPRESS_SHOT_EXCLUDED_MOD_CLASSES = [
        "techGrenade",
        "fireRatePlusPlus",
        "headhunter",
        "bulletDamageAura",
        "item_gadget_enemy"
    ];
    const BACKSTABBER_EXCLUDED_MOD_CLASSES = [
        "activeReload",
        "meleeCharge",
        "explosiveBullets",
        "fleetfootBoots",
        "titanicMagazine",
        "absorbingArmor"
    ];
    const T2_BULLET_SHIELD_PAIR_GROUP = "tier2BulletShieldPair";

    const ITEM_MIRROR_TARGETS = [
        { className: "acolytesGlove", itemKind: "tech", tier: 1, iconSrc: "file://{images}/items/spirit/spirit_strike.psd" },
        { className: "medicBullets", itemKind: "weapon", tier: 1, style: "defensive", iconSrc: "file://{images}/items/weapon/restorative_shot.psd" },
        { className: "fireRatePlus", itemKind: "tech", tier: 2, iconSrc: "file://{images}/items/spirit/quicksilver_reload.psd" },
        { className: "fireRatePlus", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/mercurial_magnum.psd" },

        // Armor (vitality) targets
        { className: "vexBarrier", itemKind: "armor", tier: 2, iconSrc: "file://{images}/items/vitality/reactive_barrier.psd" }, // Reactive Barrier
        { className: "parryRebuttal", itemKind: "armor", tier: 3, iconSrc: "file://{images}/items/vitality/counterspell.psd" }, // Counterspell
        { className: "tormentAura", itemKind: "armor", tier: 4, iconSrc: "file://{images}/items/vitality/cheat_death.psd" }, // Cheat Death
        { className: "bulletShield", itemKind: "armor", tier: 4, iconSrc: "file://{images}/items/vitality/diviners_kevlar.psd" }, // Diviner's Kevlar
        { className: "veilWalker", itemKind: "armor", tier: 3, iconSrc: "file://{images}/items/vitality/veil_walker.psd" }, // Veil Walker
        { className: "lifestrikeGauntlets", itemKind: "armor", tier: 1, style: "offensive", iconSrc: "file://{images}/items/vitality/melee_lifesteal.psd" }, // Melee Lifesteal
        { className: "boxingGlove", itemKind: "armor", tier: 3, style: "offensive", iconSrc: "file://{images}/items/vitality/lifestrike.psd" }, // Lifestrike
        { className: "stimPak", itemKind: "armor", tier: 1, iconSrc: "file://{images}/items/vitality/healing_rite.psd" }, // Healing Rite
        { className: "savior", itemKind: "armor", tier: 2, iconSrc: "file://{images}/items/vitality/guardian_ward.psd" }, // Guardian Ward
        { className: "restorativeLocket", itemKind: "armor", tier: 2, iconSrc: "file://{images}/items/vitality/restorative_locket.psd" }, // Restorative Locket
        { className: "lastStand", itemKind: "armor", tier: 2, iconSrc: "file://{images}/items/vitality/return_fire.psd" }, // Return Fire
        { className: "spiritShieldingT2", itemKind: "armor", tier: 2, style: "defensive", iconSrc: "file://{images}/items/vitality/spirit_shielding.psd", skipClassMatch: true, skipIconMatch: true, requireModClass: "bulletShield", requirePassiveItem: true, requireCooldownState: true, exceptionGroup: T2_BULLET_SHIELD_PAIR_GROUP }, // Spirit Shielding (t2)
        { className: "weaponShieldingT2", itemKind: "armor", tier: 2, style: "defensive", iconSrc: "file://{images}/items/vitality/weapon_shielding.psd", skipClassMatch: true, skipIconMatch: true, requireModClass: "bulletShield", requirePassiveItem: true, requireCooldownState: true, exceptionGroup: T2_BULLET_SHIELD_PAIR_GROUP }, // Weapon Shielding (t2)
        { className: "debuffRemover", itemKind: "armor", tier: 3, iconSrc: "file://{images}/items/vitality/debuff_remover.psd" }, // Dispell Magic
        { className: "healthNova", itemKind: "armor", tier: 3, iconSrc: "file://{images}/items/vitality/healing_nova.psd" }, // Healing Nova
        { className: "metalSkin", itemKind: "armor", tier: 3, iconSrc: "file://{images}/items/vitality/metal_skin.psd" }, // Metal Skin
        { className: "medicBeam", itemKind: "armor", tier: 3, iconSrc: "file://{images}/items/vitality/rescue_beam.psd" }, // Rescue Beam
        { className: "warpStone", itemKind: "armor", tier: 3, iconSrc: "file://{images}/items/vitality/warp_stone.psd" }, // Warp Stone
        { className: "colossus", itemKind: "armor", tier: 4, iconSrc: "file://{images}/items/vitality/colossus.psd" }, // Colossus
        { className: "savior", itemKind: "armor", tier: 4, iconSrc: "file://{images}/items/vitality/divine_barrier.psd" }, // Divine Barrier
        { className: "infuser", itemKind: "armor", tier: 4, style: "offensive", iconSrc: "file://{images}/items/vitality/infuser.psd" }, // Infuser
        { className: "unstoppable", itemKind: "armor", tier: 4, iconSrc: "file://{images}/items/vitality/unstoppable.psd" }, // Unstoppable
        { className: "surgingPower", itemKind: "armor", tier: 4, style: "offensive", iconSrc: "file://{images}/items/vitality/vampiric_burst.psd" }, // Vampiric Burst
        { className: "surgingPower", itemKind: "armor", tier: 3, style: "offensive", iconSrc: "file://{images}/items/vitality/fury_trance.psd" }, // Fury Trance
        { className: "rocketBooster", itemKind: "armor", tier: 3, style: "offensive", iconSrc: "file://{images}/items/vitality/majestic_leap.psd" }, // Majestic Leap
        { className: "phantomStrike", itemKind: "armor", tier: 4, style: "offensive", iconSrc: "file://{images}/items/vitality/phantom_strike.psd" }, // Phantom Strike

        // Weapon targets
        { className: "headshotBooster", itemKind: "weapon", tier: 1, iconSrc: "file://{images}/items/weapon/headshot_booster.psd" }, // Headshot Booster
        { className: "activeReload", itemKind: "weapon", tier: 2, iconSrc: "file://{images}/items/weapon/active_reload.psd" }, // Active Reload
        { className: "meleeCharge", itemKind: "weapon", tier: 2, iconSrc: "file://{images}/items/weapon/melee_charge.psd" }, // Melee Charge
        { className: "explosiveBullets", itemKind: "weapon", tier: 2, iconSrc: "file://{images}/items/weapon/mystic_shot.psd" }, // Mystic Shot
        { className: "backstabber", itemKind: "weapon", tier: 2, style: "offensive", iconSrc: "file://{images}/items/weapon/backstabber.psd", skipClassMatch: true, skipIconMatch: true, requirePassiveItem: true, requireCooldownState: true, excludedModClasses: BACKSTABBER_EXCLUDED_MOD_CLASSES }, // Backstabber
        { className: "techGrenade", itemKind: "weapon", tier: 3, iconSrc: "file://{images}/items/weapon/alchemical_fire.psd" }, // Alchemical Fire
        { className: "fireRatePlusPlus", itemKind: "weapon", tier: 3, iconSrc: "file://{images}/items/weapon/burst_fire.psd" }, // Burst Fire
        { className: "headhunter", itemKind: "weapon", tier: 3, iconSrc: "file://{images}/items/weapon/headhunter.psd" }, // Headhunter
        { className: "expressShot", itemKind: "weapon", tier: 3, style: "offensive", iconSrc: "file://{images}/items/weapon/express_shot.psd", skipClassMatch: true, skipIconMatch: true, requirePassiveItem: true, requireCooldownState: true, excludedModClasses: EXPRESS_SHOT_EXCLUDED_MOD_CLASSES }, // Express Shot
        { className: "meleeCharge", itemKind: "weapon", tier: 4, iconSrc: "file://{images}/items/weapon/crushing_fists.psd" }, // Crushing Fists
        { className: "fleetfootBoots", itemKind: "weapon", tier: 2, iconSrc: "file://{images}/items/weapon/fleetfoot.psd" }, // Fleetfoot
        { className: "titanicMagazine", itemKind: "weapon", tier: 2, requireCooldownCarrier: true, iconSrc: "file://{images}/items/weapon/split_shot.psd" }, // Split Shot
        { className: "electrifiedBullets", itemKind: "weapon", tier: 4, iconSrc: "file://{images}/items/weapon/capacitor.psd" }, // Capacitor
        { className: "cloakingDevice", itemKind: "weapon", tier: 4, iconSrc: "file://{images}/items/weapon/shadow_weave.psd" }, // Shadow Weave
        { className: "bulletDamageAura", itemKind: "weapon", tier: 3, style: "offensive", iconSrc: "file://{images}/items/weapon/heroic_aura.psd" }, // Heroic Aura
        { className: "item_gadget_enemy", itemKind: "weapon", tier: 3, iconSrc: "file://{images}/items/weapon/cultist_sacrifice.psd" }, // Cultist Sacrifice
        { className: "absorbingArmor", itemKind: "weapon", tier: 2, iconSrc: "file://{images}/items/weapon/recharging_rounds.psd" }, // Recharging Rush

        // Tech (spirit) targets
        { className: "megaSpirit", itemKind: "tech", tier: 3, style: "defensive", iconSrc: "file://{images}/items/spirit/radiant_regeneration.psd" }, // Radiant Regeneration
        { className: "magicBurst", itemKind: "tech", tier: 1, iconSrc: "file://{images}/items/spirit/mystic_burst.psd" }, // Mystic Burst
        { className: "spiritSnatch", itemKind: "tech", tier: 3, iconSrc: "file://{images}/items/spirit/spirit_snatch.psd" }, // Spirit Snatch
        { className: "magicStorm", itemKind: "tech", tier: 3, iconSrc: "file://{images}/items/spirit/surge_of_power.psd" }, // Surge of Power
        { className: "magicShock", itemKind: "tech", tier: 3, iconSrc: "file://{images}/items/spirit/tankbuster.psd" }, // Tankbuster
        { className: "magicReverb", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/mystic_reverb.psd" }, // Mystic Reverb
        { className: "escalatingExposure", itemKind: "tech", tier: 4, requireCooldownCarrier: true, iconSrc: "file://{images}/items/spirit/spirit_burn.psd" }, // Spirit Burn
        { className: "iceBlast", itemKind: "tech", tier: 2, iconSrc: "file://{images}/items/spirit/cold_front.psd" }, // Cold Front
        { className: "focusedSilence", itemKind: "tech", tier: 2, iconSrc: "file://{images}/items/spirit/spirit_sap.psd" }, // Spirit Sap
        { className: "rupture", itemKind: "tech", tier: 3, iconSrc: "file://{images}/items/spirit/decay.psd" }, // Decay
        { className: "knockdown", itemKind: "tech", tier: 3, iconSrc: "file://{images}/items/spirit/knockdown.psd" }, // Knockdown
        { className: "rupture", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/scourge.psd" }, // Scourge
        { className: "focusedSilence", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/focus_lens.psd" }, // Focus Lens
        { className: "abilityRefresher", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/refresher.psd" }, // Refresher
        { className: "iceBlast", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/arctic_blast.psd" }, // Arctic Blast
        { className: "powerShard", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/echo_shard.psd" }, // Echo Shard
        { className: "glitch", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/curse.psd" }, // Cursed Relic
        { className: "areaImmobilize", itemKind: "tech", tier: 4, iconSrc: "file://{images}/items/spirit/vortex_web.psd" }, // Vortex Web
        { className: "slowingTech", itemKind: "tech", tier: 1, style: "defensive", iconSrc: "file://{images}/items/spirit/rusted_barrel.psd" }, // Rusted Barrel
        { className: "immobilize", itemKind: "tech", tier: 2, style: "defensive", iconSrc: "file://{images}/items/spirit/slowing_hex.psd" }, // Slowing Hex
        { className: "disarm", itemKind: "tech", tier: 3, style: "defensive", iconSrc: "file://{images}/items/spirit/disarming_hex.psd" }, // Disarming Hex
        { className: "targetedSilence", itemKind: "tech", tier: 3, style: "defensive", iconSrc: "file://{images}/items/spirit/silence_glyph.psd" }, // Silence Wave
        { className: "magicCarpet", itemKind: "tech", tier: 4, style: "defensive", iconSrc: "file://{images}/items/spirit/magic_carpet.psd" }, // Magic Carpet
        { className: "shiftingShroud", itemKind: "tech", tier: 4, style: "defensive", iconSrc: "file://{images}/items/spirit/ethereal_shift.psd" } // Ethereal Shift
    ];
    const ITEM_MIRROR_FORCED_IMAGE_BY_CLASS = {
        acolytesGlove: "file://{images}/items/spirit/spirit_strike.psd",
        medicBullets: "file://{images}/items/weapon/restorative_shot.psd",
        fireRatePlus: "file://{images}/items/spirit/quicksilver_reload.psd"
    };


    function BuildPayloadDecodeBase64(str) {
        if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.DecodeBase64 === "function") {
            return QOL_CODEC.DecodeBase64(str);
        }
        return "";
    }

// ── Compatibility aliases (commit 1.1: redirect to shared module) ──
var BUILD_CATEGORY_COMPACT_SCHEMA_REGISTRY = QOL_COMPACT_SCHEMA_REGISTRY;
var BUILD_CATEGORY_COMPACT_WIRE_TO_SEMVER = QOL_COMPACT_SCHEMA_WIRE_TO_SEMVER;
var BUILD_CATEGORY_LATEST_COMPACT_SEMVER = QOL_LATEST_COMPACT_SEMVER;
function GetBuildPayloadCompactSchema(s)     { return QOL_COMPACT_SCHEMA_UTILS.GetSchema(s); }
function GetBuildPayloadCompactWireVersion(s) { return QOL_COMPACT_SCHEMA_UTILS.GetWireVersion(s); }
function ResolveBuildPayloadCompactSemverFromWireVersion(wv) { return QOL_COMPACT_SCHEMA_UTILS.ResolveSemverFromWire(wv); }
var BUILD_CATEGORY_COMPACT_DEFAULT_HERO_FIELD = QOL_COMPACT_DEFAULT_HERO_FIELD;
var BUILD_CATEGORY_COMPACT_DEFAULT_HERO_OPTIONS = QOL_COMPACT_DEFAULT_HERO_OPTIONS;

function BuildPayloadFromBase64Url(urlStr) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.FromBase64Url === "function") {
        return QOL_CODEC.FromBase64Url(urlStr);
    }
    var padded = String(urlStr || "").replace(/-/g, "+").replace(/_/g, "/");
    while (padded.length % 4 !== 0) padded += "=";
    return BuildPayloadDecodeBase64(padded);
}

function BuildPayloadEncodeBase64(binaryStr) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.EncodeBase64Raw === "function") {
        return QOL_CODEC.EncodeBase64Raw(binaryStr);
    }
    return "";
}

function BuildPayloadToBase64Url(binaryStr) {
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.ToBase64Url === "function") {
        return QOL_CODEC.ToBase64Url(binaryStr);
    }
    return BuildPayloadEncodeBase64(binaryStr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function SerializeBuildPayloadCompact(config, semverOverride) {
    var semver = String(semverOverride || BUILD_CATEGORY_LATEST_COMPACT_SEMVER);
    var wireVersion = GetBuildPayloadCompactWireVersion(semver);
    var schema = GetBuildPayloadCompactSchema(semver);
    var defaults = _BDC();
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.SerializeCompactBinary === "function") {
        return QOL_CODEC.SerializeCompactBinary(config, schema, wireVersion, function(field, cfg) {
            var val = cfg && cfg.hasOwnProperty(field.key) ? cfg[field.key] : field.min;
            if (field.key === "ULT_COOLDOWN_X_OFFSET" || field.key === "ULT_COOLDOWN_Y_OFFSET") {
                val = 0;
            }
            if (field.key === BUILD_CATEGORY_COMPACT_DEFAULT_HERO_FIELD) {
                var configuredHero = cfg && cfg.DEFAULT_HERO ? String(cfg.DEFAULT_HERO) : "";
                var heroIndex = BUILD_CATEGORY_COMPACT_DEFAULT_HERO_OPTIONS.indexOf(configuredHero);
                if (heroIndex < 0) {
                    var defaultHero = defaults && defaults.DEFAULT_HERO ? String(defaults.DEFAULT_HERO) : "";
                    heroIndex = BUILD_CATEGORY_COMPACT_DEFAULT_HERO_OPTIONS.indexOf(defaultHero);
                }
                if (heroIndex < 0) heroIndex = 0;
                val = heroIndex;
            }
            return val;
        });
    }
    throw new Error("Build payload serializer unavailable");
}

function BuildDefaultPayloadToken(cfg) {
    var defaults = _BDC();
    var payloadConfig = {};
    for (var key in defaults) {
        payloadConfig[key] = defaults[key];
    }
    var defaultHero = QOL.getConfiguredDefaultHeroId(cfg);
    if (defaultHero && defaultHero.length > 0) {
        payloadConfig.DEFAULT_HERO = defaultHero;
    }
    var compact = SerializeBuildPayloadCompact(payloadConfig);
    var encoded = BuildPayloadToBase64Url(compact);
    if (!encoded || encoded.length === 0) return "";
    return BUILD_CATEGORY_PAYLOAD_EXPORT_PREFIX + encoded;
}

function QueueBuildSaveRequestFromLoader(root, payloadText, nowMs) {
    if (!root || !root.SetAttributeString) return "";
    var payload = payloadText ? String(payloadText).replace(/\s+/g, "") : "";
    if (!payload || !BUILD_CATEGORY_PAYLOAD_TOKEN_REGEX.test(payload)) return "";
    // Guard: if a save is already in-flight, don't overwrite its attributes.
    // Return the existing token so the caller can wait for it to complete.
    var existingState = "";
    try { existingState = String(root.GetAttributeString(BUILD_SAVE_STATE_ATTR, "") || ""); } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
    if (existingState === "pending") {
        var existingToken = "";
        try { existingToken = String(root.GetAttributeString(BUILD_SAVE_TOKEN_ATTR, "") || ""); } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        return existingToken;
    }
    var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
    var token = "startup_" + String(now) + "_" + String(Math.floor(Math.random() * 1000000));
    root.SetAttributeString(BUILD_SAVE_REQUEST_ATTR, payload);
    root.SetAttributeString(BUILD_SAVE_TOKEN_ATTR, token);
    root.SetAttributeString(BUILD_SAVE_MSG_ATTR, "queued");
    root.SetAttributeString(BUILD_SAVE_STATE_ATTR, "pending");
    return token;
}

function ResetBuildClearRequestAttributes(root) {
    if (!root || !root.SetAttributeString) return;
    root.SetAttributeString(BUILD_CLEAR_REQUEST_ATTR, "");
    root.SetAttributeString(BUILD_CLEAR_TOKEN_ATTR, "");
    root.SetAttributeString(BUILD_CLEAR_MSG_ATTR, "");
    root.SetAttributeString(BUILD_CLEAR_STATE_ATTR, "");
}

function IsStartupCorruptRepairPending(root) {
    if (!root || !root.GetAttributeString) return false;
    var raw = "";
    try { raw = String(root.GetAttributeString(BUILD_CORRUPT_REPAIR_PENDING_ATTR, "")); } catch (e0) { raw = ""; }
    return raw === "1";
}

function SetStartupCorruptRepairPending(root, pending) {
    if (!root || !root.SetAttributeString) return;
    try { root.SetAttributeString(BUILD_CORRUPT_REPAIR_PENDING_ATTR, pending ? "1" : ""); } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
}


function DeserializeBuildPayloadCompact(binaryStr, expectedSemver) {
    var raw = String(binaryStr || "");
    if (raw.length < 1) throw new Error("Compact string too short");
    var wireVersion = raw.charCodeAt(0) & 255;
    var semver = "";
    if (expectedSemver) {
        var expected = String(expectedSemver);
        var expectedWireVersion = GetBuildPayloadCompactWireVersion(expected);
        if (expectedWireVersion !== wireVersion) throw new Error("Build payload schema wire version mismatch");
        semver = expected;
    } else {
        semver = ResolveBuildPayloadCompactSemverFromWireVersion(wireVersion);
    }
    var schema = GetBuildPayloadCompactSchema(semver);
    if (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.DeserializeCompactBinary === "function") {
        return QOL_CODEC.DeserializeCompactBinary(
            raw,
            schema,
            function(field, value, parsed) {
                if (field.key === BUILD_CATEGORY_COMPACT_DEFAULT_HERO_FIELD) {
                    var heroIndex = Math.round(value);
                    if (heroIndex < 0 || heroIndex >= BUILD_CATEGORY_COMPACT_DEFAULT_HERO_OPTIONS.length) heroIndex = 0;
                    var defaults = _BDC();
                    var fallbackHeroId = defaults && defaults.DEFAULT_HERO ? String(defaults.DEFAULT_HERO) : "";
                    var resolvedHeroId = BUILD_CATEGORY_COMPACT_DEFAULT_HERO_OPTIONS[heroIndex] || fallbackHeroId || "hero_werewolf";
                    parsed.DEFAULT_HERO = resolvedHeroId;
                    return true;
                }
                return false;
            },
            function(missingField, parsed) {
                if (!missingField || !missingField.key) return;
                var defaults = _BDC();
                if (missingField.key === BUILD_CATEGORY_COMPACT_DEFAULT_HERO_FIELD) {
                    var fallbackHero = (defaults && defaults.DEFAULT_HERO) ? String(defaults.DEFAULT_HERO) : "hero_werewolf";
                    parsed.DEFAULT_HERO = fallbackHero;
                } else if (defaults && defaults.hasOwnProperty(missingField.key)) {
                    parsed[missingField.key] = defaults[missingField.key];
                }
            }
        );
    }
    throw new Error("Build payload deserializer unavailable");
}



function GetUIRoot() {
        var cached = GetCachedPanel("uiRoot");
        if (IsPanelValid(cached)) {
            return cached;
        }
        var p = $.GetContextPanel();
        var uiRootGuard = 0;
        while (p && p.GetParent && p.GetParent() && uiRootGuard < 64) { p = p.GetParent(); uiRootGuard++; }
        if (uiRootGuard >= 64) QOL_WARN("ui", "GetUIRoot: parent-chain walk hit guard limit — panel hierarchy may be corrupted");
        SetCachedPanel("uiRoot", p);
        return p || null;
    }

    var _readStorageDiagLogged = false;
    var _writeStorageDiagLogged = false;
    var _startupConfigLoadDiagLogged = false;
    var _startupConfigDefaultDiagLogged = false;

    // ReadStorageConfigRawFromUi — reads the serialized config from both the root and Hud
    // panel attributes, picking the version with the highest user-edit revision number.
    // Falls back to persistentStorage when panel attrs are empty (e.g. after restart).
    function ReadStorageConfigRawFromUi(root) {
        
        var result = "";
        var source = "none";
        var rootLen = 0;
        var hudLen = 0;
        if (root && root.GetAttributeString) {
            var rootRaw = "";
            try { rootRaw = String(root.GetAttributeString(STORAGE_KEY, "") || ""); } catch (e0) { rootRaw = ""; }
            rootLen = rootRaw.length;

            var hud = null;
            try { hud = root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_HUD) : null; } catch (e1) { hud = null; }
            if (!hud || !hud.GetAttributeString) {
                result = rootRaw;
                if (rootLen > 0) source = "root_attr";
            } else {
                var hudRaw = "";
                try { hudRaw = String(hud.GetAttributeString(STORAGE_KEY, "") || ""); } catch (e2) { hudRaw = ""; }
                hudLen = hudRaw.length;
                if (!hudRaw) {
                    result = rootRaw;
                    source = rootLen > 0 ? "root_attr" : "none";
                } else if (!rootRaw) {
                    result = hudRaw;
                    source = "hud_attr";
                } else {
                    var parseRev = function(v) {
                        var n = Number(v);
                        if (!isFinite(n) || n < 0) return 0;
                        return Math.floor(n);
                    };
                    var rootRev = 0;
                    var hudRev = 0;
                    try { rootRev = parseRev(root.GetAttributeString(USER_EDIT_REV_ATTR, "")); } catch (e3) { rootRev = 0; }
                    try { hudRev = parseRev(hud.GetAttributeString(USER_EDIT_REV_ATTR, "")); } catch (e4) { hudRev = 0; }
                    result = (hudRev >= rootRev) ? hudRaw : rootRaw;
                    source = "attr_rev(" + rootRev + "/" + hudRev + ")";
                }
            }
        }
        // $.persistentStorage confirmed absent (panorama_api_test, 2026-06-11).
        // Panel attributes are the only persistence mechanism.
        if (!_readStorageDiagLogged) {
            _readStorageDiagLogged = true;
            $.Msg("[QOLLock][DIAG][storage] ReadStorageConfig: source=" + source + " resultLen=" + result.length + " rootAttrLen=" + rootLen + " hudAttrLen=" + hudLen);
        }
        return result;
    }

    // WriteStorageConfigRawToUi — persists config to both root and Hud panel attributes,
    // increments the user-edit revision, and mirrors to persistentStorage as backup.
    function WriteStorageConfigRawToUi(root, rawText) {
        _TLog("config:WriteToUi", "len=" + (rawText ? String(rawText).length : 0));
        if (!root || !root.SetAttributeString) {
            return { raw: String(rawText || ""), revision: 0, count: 0 };
        }

        var nextRaw = String(rawText || "");
        var hud = null;
        try { hud = root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_HUD) : null; } catch (e0) { hud = null; }
        var parseRev = (typeof QOL_UTILS !== "undefined" && QOL_UTILS.ParseRevisionNumber) || function(v) { var n = Number(v); if (!isFinite(n) || n < 0) return 0; return Math.floor(n); };
        var rootRev = 0;
        var hudRev = 0;
        try { rootRev = parseRev(root.GetAttributeString(USER_EDIT_REV_ATTR, "")); } catch (e1) { rootRev = 0; }
        try { hudRev = hud && hud.GetAttributeString ? parseRev(hud.GetAttributeString(USER_EDIT_REV_ATTR, "")) : 0; } catch (e2) { hudRev = 0; }
        var nextRevision = Math.max(rootRev, hudRev) + 1;

        // Write data + revision as a paired update per panel so an interrupted
        // save never orphans new data with an old revision number.
        try { root.SetAttributeString(STORAGE_KEY, nextRaw); } catch (e3) { QOL_ERROR("persist", "root.SetAttributeString(STORAGE_KEY) failed: " + (e3 && e3.message ? e3.message : String(e3 || ""))); }
        try { root.SetAttributeString(USER_EDIT_REV_ATTR, String(nextRevision)); } catch (e4) { QOL_ERROR("persist", "root.SetAttributeString(USER_EDIT_REV) failed: " + (e4 && e4.message ? e4.message : String(e4 || ""))); }
        if (hud && hud.SetAttributeString) {
            try { hud.SetAttributeString(STORAGE_KEY, nextRaw); } catch (e5) { QOL_ERROR("persist", "hud.SetAttributeString(STORAGE_KEY) failed: " + (e5 && e5.message ? e5.message : String(e5 || ""))); }
            try { hud.SetAttributeString(USER_EDIT_REV_ATTR, String(nextRevision)); } catch (e6) { QOL_ERROR("persist", "hud.SetAttributeString(USER_EDIT_REV) failed: " + (e6 && e6.message ? e6.message : String(e6 || ""))); }
        }
        // $.persistentStorage confirmed absent (panorama_api_test, 2026-06-11).

        if (!_writeStorageDiagLogged) {
            _writeStorageDiagLogged = true;
            $.Msg("[QOLLock][DIAG][storage] WriteStorageConfig: len=" + nextRaw.length + " rev=" + nextRevision + " hud=" + (hud && hud.SetAttributeString ? "yes" : "no"));
        }

        return {
            raw: nextRaw,
            revision: nextRevision,
            count: hud && hud.SetAttributeString ? 2 : 1
        };

    }

    var FindFirstPanelByClass = QOL_UTILS_LOADED ? QOL_UTILS.FindFirstPanelByClass : function(root, className) {
        if (!root || !root.FindChildrenWithClassTraverse || !className) return null;
        var panels = root.FindChildrenWithClassTraverse(className) || [];
        for (var i = 0; i < panels.length; i++) {
            if (IsPanelValid(panels[i])) return panels[i];
        }
        return null;
    };

    var hasClassInHierarchy = QOL_UTILS_LOADED ? QOL_UTILS.HasClassInHierarchy : function(panel, className) {
        var current = panel;
        while (current) {
            if (current.BHasClass(className)) return true;
            current = current.GetParent();
        }
        return false;
    };

    function IsHudClassActive(root, className) {
        if (!className) return false;
        if (root && root.BHasClass && root.BHasClass(className)) return true;

        var gameplayHud = ResolveCachedPanel(root, "gameplayHud", PANEL_ID_GAMEPLAY_HUD);
        if (gameplayHud && gameplayHud.BHasClass && gameplayHud.BHasClass(className)) return true;

        var abilities = ResolveCachedPanel(root, "abilitiesContainer", PANEL_ID_ABILITIES_CONTAINER);
        if (abilities && abilities.BHasClass && abilities.BHasClass(className)) return true;

        return false;
    }

    var FindAncestorWithClass = QOL_UTILS_LOADED ? QOL_UTILS.FindAncestorWithClass : function(panel, className) {
        var current = panel;
        while (current) {
            if (current.BHasClass && current.BHasClass(className)) return current;
            current = current.GetParent ? current.GetParent() : null;
        }
        return null;
    };

    function FindItemOwnerFromContainer(iconContainer) {
        var current = iconContainer;
        while (current) {
            if (current.BHasClass) {
                if (current.BHasClass("isWeapon") || current.BHasClass("isArmor") || current.BHasClass("isTech")) return current;
                if (current.BHasClass("isTier1") || current.BHasClass("isTier2") || current.BHasClass("isTier3") || current.BHasClass("isTier4")) return current;
            }
            current = current.GetParent ? current.GetParent() : null;
        }
        return null;
    }

    // IsPanelValid is now provided by QOL_UTILS (ql_utils.js) — alias at top of file

    function ToRgbString(rgb) {
        return "rgb(" + rgb[0] + ", " + rgb[1] + ", " + rgb[2] + ")";
    }

    function BlendRgb(a, b, t) {
        return [
            Math.round(a[0] + ((b[0] - a[0]) * t)),
            Math.round(a[1] + ((b[1] - a[1]) * t)),
            Math.round(a[2] + ((b[2] - a[2]) * t))
        ];
    }

    var SetStyleSafe = QOL_UTILS_LOADED ? QOL_UTILS.SetStyleSafe : function(panel, prop, value) {
        if (!panel || !panel.style || !prop) return;
        try { panel.style[prop] = value; } catch(e) { QOL_WARN("core", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
    };

    var ClearStyleSafe = QOL_UTILS_LOADED ? QOL_UTILS.ClearStyleSafe : function(panel, prop) {
        if (!panel || !panel.style || !prop) return;
        try { delete panel.style[prop]; } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        try { panel.style[prop] = null; } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        try { panel.style[prop] = ""; } catch(e2) { QOL_WARN("core", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
    };

    function SetWashColorSafe(panel, color) {
        if (color) {
            SetStyleSafe(panel, "washColor", String(color));
        } else {
            ClearStyleSafe(panel, "washColor");
        }
    }

    const QOL_WASH_COLOR_PALETTE = [
        "",
        "#f7f4e8",
        "#bfc7cf",
        "#33363f",
        "#ff3b47",
        "#ff6f61",
        "#ff8a2a",
        "#ffb52e",
        "#ffe45c",
        "#a8f04f",
        "#45d66b",
        "#63f0b5",
        "#24c6a8",
        "#44e3ff",
        "#64bfff",
        "#3f78ff",
        "#6157ff",
        "#9b5cff",
        "#c15cff",
        "#ff4de3",
        "#ff78bd",
        "#ff5d89",
        "#9a6743",
        "#d9a441",
        "#8cff4f",
        "#7c4dff",
        "#b8142f",
        "#b9f4ff",
        "#d7b2ff",
        "#05070a"
    ];

    function NormalizePaletteColorIndex(value) {
        var numeric = Math.round(Number(value));
        if (!isFinite(numeric)) numeric = 0;
        if (numeric < 0) numeric = 0;
        if (numeric >= QOL_WASH_COLOR_PALETTE.length) numeric = 0;
        return numeric;
    }

    function ResolveWashColorFromPalette(value) {
        var index = NormalizePaletteColorIndex(value);
        var color = QOL_WASH_COLOR_PALETTE[index] || "";
        return color ? String(color) : "";
    }

    function ReadPaletteColorIndexWithPanelAttr(cfg, key, attrName) {
        // Config is the canonical source. Panel attributes are a secondary
        // bridge that can go stale when config is updated via preset import,
        // build payload override, or migration — none of which update the
        // per-color bridge attributes. Always trust config.
        return NormalizePaletteColorIndex(cfg && cfg[key]);
    }

    function ReadPlayerHealthbarAccentColorIndex(cfg) {
        return ReadPaletteColorIndexWithPanelAttr(cfg, "PLAYER_HEALTHBAR_ACCENT_COLOR", PLAYER_HEALTHBAR_ACCENT_COLOR_ATTR);
    }

    function ReadBottomBarWashColorIndex(cfg) {
        return ReadPaletteColorIndexWithPanelAttr(cfg, "BOTTOM_BAR_WASH_COLOR", BOTTOM_BAR_WASH_COLOR_ATTR);
    }

    function ReadKeyboardOverlayWashColorIndex(cfg) {
        return ReadPaletteColorIndexWithPanelAttr(cfg, "KEYBOARD_OVERLAY_WASH_COLOR", KEYBOARD_OVERLAY_WASH_COLOR_ATTR, "");
    }

    function ReadStaminaChargeColorIndex(cfg) {
        return ReadPaletteColorIndexWithPanelAttr(cfg, "STAMINA_CHARGE_COLOR", STAMINA_CHARGE_COLOR_ATTR, "");
    }

    function ReadAmmoTextColorIndex(cfg) {
        return ReadPaletteColorIndexWithPanelAttr(cfg, "AMMO_TEXT_COLOR", AMMO_TEXT_COLOR_ATTR, "");
    }

    function ReadMinimapIconColorIndex(cfg) {
        return ReadPaletteColorIndexWithPanelAttr(cfg, "MINIMAP_ICON_COLOR", MINIMAP_ICON_COLOR_ATTR, "");
    }

    function ResolvePassiveCooldownMode(cfg) {
        var masterEnabled = IsCfgEnabled(cfg, "ENABLE_PASSIVE_COOLDOWN");
        if (!masterEnabled) return "default";
        var advancedModeEnabled = Number(cfg && cfg.ENABLE_OLD_ITEM_COOLDOWNS) !== 1 || ITEM_COOLDOWN_DUAL_MODE_TEST;
        return advancedModeEnabled ? "advanced" : "basic";
    }

    function IsPassiveCooldownBasicMode(mode) {
        return mode === "basic";
    }

    function IsPassiveCooldownAdvancedMode(mode) {
        return mode === "advanced";
    }


    function ResetPassiveCooldownCustomRuntimeState(root) {
        if (!root) return;
        SetPanelClassCached(root, State.rootClassCache, "passive_cooldown_advanced_active", false);
        var passiveHud = GetCachedPanel("passiveHud");
        if (!passiveHud && root.FindChildTraverse) {
            passiveHud = root.FindChildTraverse("hud_passive_items");
            SetCachedPanel("passiveHud", passiveHud);
        }
        if (passiveHud) {
            SetStyleSafe(passiveHud, "visibility", "");
            SetStyleSafe(passiveHud, "opacity", "");
        }
    }

    function ApplyPassiveCooldownModeClasses(root, passiveHud, passiveCooldownMode) {
        var basicModeActive = IsPassiveCooldownBasicMode(passiveCooldownMode);
        var advancedModeActive = IsPassiveCooldownAdvancedMode(passiveCooldownMode);
        SetPanelClassCached(root, State.rootClassCache, "passive_cooldown_basic_active", basicModeActive);
        SetPanelClassCached(root, State.rootClassCache, "passive_cooldown_advanced_active", advancedModeActive);
        SetPanelClassCached(root, State.rootClassCache, "old_item_cooldowns_active", false);
        SetPanelClassCached(root, State.rootClassCache, "passive_cooldown_custom_active", false);
        if (passiveHud) {
            SetPanelClassCached(passiveHud, State.passiveHudClassCache, "passive_cooldown_basic_active", basicModeActive);
            SetPanelClassCached(passiveHud, State.passiveHudClassCache, "old_item_cooldowns_active", false);
        }
        State.passiveCooldownModeApplied = passiveCooldownMode;
    }

    function IsDescendantOf(panel, ancestor) {
        if (!panel || !ancestor) return false;
        var current = panel;
        while (current) {
            if (current === ancestor) return true;
            current = current.GetParent ? current.GetParent() : null;
        }
        return false;
    }
    function IsColorWarningEnabled(cfg) {
        if (!cfg) return false;
        return IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_25") ||
            IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_65") ||
            IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_75");
    }


    function ReadPanelOpacityMaybe(panel) {
        if (!panel || !IsPanelValid(panel) || !panel.style) return NaN;
        var raw = "";
        try { raw = String(panel.style.opacity || ""); } catch (e0) { raw = ""; }
        if (!raw || raw.length === 0) return NaN;

        var opacity = Number(raw);
        if (isFinite(opacity)) return opacity;
        if (raw.indexOf("%") !== -1) {
            var pct = Number(String(raw).replace("%", ""));
            if (isFinite(pct)) return pct / 100;
        }
        return NaN;
    }

    function IsPanelSuppressedMaybe(panel) {
        if (!panel || !IsPanelValid(panel)) return true;
        if (!IsPanelVisibleMaybe(panel)) return true;
        var opacity = ReadPanelOpacityMaybe(panel);
        if (isFinite(opacity) && opacity <= 0.01) return true;
        return false;
    }

    function IsPanelEffectivelyVisibleMaybe(panel, stopAncestor) {
        var current = panel;
        while (current && IsPanelValid(current)) {
            if (IsPanelSuppressedMaybe(current)) return false;
            if (stopAncestor && current === stopAncestor) break;
            current = current.GetParent ? current.GetParent() : null;
        }
        return true;
    }

    function IsHudVisibleForPlayerHealthbarRuntime(root, healthContainer) {
        if (!root) return true;

        function hasAnyClassInHierarchySafe(panel, classNames) {
            if (!panel || !classNames || classNames.length <= 0) return false;
            for (var i = 0; i < classNames.length; i++) {
                var cls = classNames[i];
                if (!cls) continue;
                try {
                    if (hasClassInHierarchy(panel, cls)) return true;
                } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
            }
            return false;
        }

        // WHY: connectedToHideout must be here so inline style.opacity is never
        // set anywhere in the hideout (hero sandbox has connectedToHideout but
        // NOT InHideout/inHideoutIntro). Inline opacity overrides CSS rules.
        var hiddenContextClasses = [
            "connectedToHideout",
            "InHideout",
            "inHideout",
            "inHideoutIntro",
            "HideoutIntro"
        ];
        var hiddenUiClasses = [
            "ShowEscapeMenu",
            "HudTakeoverEnabled"
        ];

        var hud = ResolveCachedPanel(root, "hudPanel", PANEL_ID_HUD);
        if (hasAnyClassInHierarchySafe(root, hiddenUiClasses)) return false;
        if (hasAnyClassInHierarchySafe(hud, hiddenUiClasses)) return false;
        if (hasAnyClassInHierarchySafe(root, hiddenContextClasses)) return false;
        if (hasAnyClassInHierarchySafe(hud, hiddenContextClasses)) return false;
        if (hasAnyClassInHierarchySafe(healthContainer, hiddenContextClasses)) return false;

        var gameplayHud = ResolveCachedPanel(root, "gameplayHud", PANEL_ID_GAMEPLAY_HUD);
        var gameplayHudAlive = ResolveCachedPanel(root, "gameplayHudAlive", "gameplay_hud_alive");
        var topBar = ResolveCachedPanel(root, "topBarPanel", PANEL_ID_TOP_BAR);
        var abilities = ResolveCachedPanel(root, "abilitiesContainer", PANEL_ID_ABILITIES_CONTAINER);
        var statsAndMods = ResolveCachedPanel(root, "statsAndModsContainer", "StatsAndModsContainer");

        if (!IsPanelEffectivelyVisibleMaybe(healthContainer, root)) return false;
        if (statsAndMods && !IsPanelEffectivelyVisibleMaybe(statsAndMods, root)) return false;

        var signalPanels = [gameplayHud, gameplayHudAlive, topBar, abilities, statsAndMods, healthContainer];
        var signalCount = 0;
        var suppressedCount = 0;
        for (var i = 0; i < signalPanels.length; i++) {
            var signalPanel = signalPanels[i];
            if (!IsPanelValid(signalPanel)) continue;
            signalCount++;
            if (IsPanelSuppressedMaybe(signalPanel)) suppressedCount++;
        }
        if (signalCount > 0 && suppressedCount >= signalCount) return false;

        return true;
    }

    function HasNonDefaultPlayerHealthbarRuntimeConfig(cfg) {
        if (!cfg) return false;
        var playerOffsetX = (cfg.PLAYER_HEALTHBAR_X_OFFSET === undefined || cfg.PLAYER_HEALTHBAR_X_OFFSET === null)
            ? 0
            : Math.round(Number(cfg.PLAYER_HEALTHBAR_X_OFFSET));
        var playerOffsetY = (cfg.PLAYER_HEALTHBAR_Y_OFFSET === undefined || cfg.PLAYER_HEALTHBAR_Y_OFFSET === null)
            ? 0
            : Math.round(Number(cfg.PLAYER_HEALTHBAR_Y_OFFSET));
        var playerScale = (cfg.PLAYER_HEALTHBAR_SCALE === undefined || cfg.PLAYER_HEALTHBAR_SCALE === null)
            ? 100
            : Math.round(Number(cfg.PLAYER_HEALTHBAR_SCALE));
        var playerOpacity = (cfg.PLAYER_HEALTHBAR_OPACITY === undefined || cfg.PLAYER_HEALTHBAR_OPACITY === null)
            ? 1.0
            : Number(cfg.PLAYER_HEALTHBAR_OPACITY);
        if (!isFinite(playerOffsetX)) playerOffsetX = 0;
        if (!isFinite(playerOffsetY)) playerOffsetY = 0;
        if (!isFinite(playerScale)) playerScale = 100;
        if (!isFinite(playerOpacity)) playerOpacity = 1.0;
        return (
            playerOffsetX !== 0 ||
            playerOffsetY !== 0 ||
            playerScale !== 100 ||
            Math.abs(playerOpacity - 1.0) > 0.0001 ||
            ReadPlayerHealthbarAccentColorIndex(cfg) !== 0
        );
    }


    function NeedsHealthbarRuntimeHelperWork(cfg, healthbarType, minimalistHealthbarEnabled) {
        var shouldRunMinimalistRuntime =
            minimalistHealthbarEnabled ||
            HasNonDefaultPlayerHealthbarRuntimeConfig(cfg) ||
            !!(State.playerHealthbarAccentColorSig && String(State.playerHealthbarAccentColorSig).length > 0) ||
            State.minimalistHealthbarOffsetApplied ||
            State.playerHealthbarScaleOpacityRuntimeApplied;
        if (shouldRunMinimalistRuntime) return true;
        if ((Number(healthbarType) === 4) || State.budhudWasEnabled) return true;
        if ((Number(healthbarType) === HEALTHBAR_TYPE_MINECRAFT) || State.mcWasEnabled) return true;
        return false;
    }


    function ResetDamageReportOffsetRuntime(panel) {
        if (!IsPanelValid(panel)) return;
        try { panel.style.x = "0px"; } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        try { panel.style.y = "0px"; } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
    }

    function NeedsDamageReportOffsetWork(cfg) {
        if (!cfg) return false;
        var offsetX = Number(cfg.DAMAGE_REPORT_X_OFFSET);
        var offsetY = Number(cfg.DAMAGE_REPORT_Y_OFFSET);
        if (!isFinite(offsetX)) offsetX = 0;
        if (!isFinite(offsetY)) offsetY = 0;
        if (Math.round(offsetX) !== 0 || Math.round(offsetY) !== 0) return true;
        return !!(
            State.damageReportOffsetApplied ||
            State.damageReportOffsetSig ||
            IsPanelValid(State.damageReportOffsetPanel)
        );
    }

    function SyncLegacyCooldownsUiFlag(enabled) {
        var normalized = enabled ? 1 : 0;
        if (State.legacyCooldownsUiFlag === normalized) return;
        State.legacyCooldownsUiFlag = normalized;
        // GameUI.CustomUIConfig confirmed absent — flag tracked in State only.
    }

    function HasNonDefaultChatRuntimeConfig(cfg) {
        if (!cfg) return false;
        var enabled = (cfg.ENABLE_CHAT === undefined || cfg.ENABLE_CHAT === null)
            ? 1
            : Math.round(Number(cfg.ENABLE_CHAT));
        var scale = (cfg.CHAT_SCALE === undefined || cfg.CHAT_SCALE === null)
            ? 100
            : Math.round(Number(cfg.CHAT_SCALE));
        var offsetX = (cfg.CHAT_X_OFFSET === undefined || cfg.CHAT_X_OFFSET === null)
            ? 0
            : Math.round(Number(cfg.CHAT_X_OFFSET));
        var offsetY = (cfg.CHAT_Y_OFFSET === undefined || cfg.CHAT_Y_OFFSET === null)
            ? 0
            : Math.round(Number(cfg.CHAT_Y_OFFSET));
        if (!isFinite(enabled)) enabled = 1;
        if (!isFinite(scale)) scale = 100;
        if (!isFinite(offsetX)) offsetX = 0;
        if (!isFinite(offsetY)) offsetY = 0;
        return enabled !== 1 || scale !== 100 || offsetX !== 0 || offsetY !== 0;
    }

    function ResetChatRuntime(panel) {
        if (!IsPanelValid(panel)) return;
        try { panel.style.x = "0px"; } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        try { panel.style.y = "0px"; } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        try { panel.style.preTransformScale2d = "1.00, 1.00"; } catch(e2) { QOL_WARN("core", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
        try { panel.style.visibility = "visible"; } catch(e3) { QOL_WARN("core", "op failed: " + (e3 && e3.message ? e3.message : String(e3 || ""))); }
    }

    function UpdateChatRuntime(root, cfg) {
        var livePanel = (root && root.FindChildTraverse) ? root.FindChildTraverse("Chat") : null;
        var chatPanel = IsPanelValid(livePanel) ? livePanel : (GetCachedPanel("chatPanel"));
        if (chatPanel !== GetCachedPanel("chatPanel")) {
            SetCachedPanel("chatPanel", chatPanel);
        }

        var previousPanel = IsPanelValid(State.chatStylePanel) ? State.chatStylePanel : null;
        if (previousPanel && previousPanel !== chatPanel) {
            ResetChatRuntime(previousPanel);
        }

        if (!chatPanel) {
            State.chatStyleSig = "";
            State.chatStyleApplied = false;
            State.chatStylePanel = null;
            return;
        }

        var scale = (cfg.CHAT_SCALE === undefined || cfg.CHAT_SCALE === null)
            ? 100
            : Math.round(Number(cfg.CHAT_SCALE));
        var enabled = (cfg.ENABLE_CHAT === undefined || cfg.ENABLE_CHAT === null)
            ? 1
            : Math.round(Number(cfg.ENABLE_CHAT));
        var offsetX = (cfg.CHAT_X_OFFSET === undefined || cfg.CHAT_X_OFFSET === null)
            ? 0
            : Math.round(Number(cfg.CHAT_X_OFFSET));
        var offsetY = (cfg.CHAT_Y_OFFSET === undefined || cfg.CHAT_Y_OFFSET === null)
            ? 0
            : Math.round(Number(cfg.CHAT_Y_OFFSET));
        if (!isFinite(enabled)) enabled = 1;
        if (!isFinite(scale)) scale = 100;
        if (!isFinite(offsetX)) offsetX = 0;
        if (!isFinite(offsetY)) offsetY = 0;
        if (scale < 50) scale = 50;
        if (scale > 200) scale = 200;
        if (offsetX < -1500) offsetX = -1500;
        if (offsetX > 1500) offsetX = 1500;
        if (offsetY < -250) offsetY = -250;
        if (offsetY > 800) offsetY = 800;

        var scaleText = (scale / 100).toFixed(2) + ", " + (scale / 100).toFixed(2);
        var styleSig = enabled + "|" + scaleText + "|" + offsetX + "|" + offsetY;
        if (
            State.chatStyleApplied &&
            State.chatStylePanel === chatPanel &&
            State.chatStyleSig === styleSig
        ) {
            return;
        }

        chatPanel.style.visibility = enabled === 1 ? "visible" : "collapse";
        chatPanel.style.x = String(offsetX) + "px";
        chatPanel.style.y = String(-offsetY) + "px";
        chatPanel.style.preTransformScale2d = scaleText;

        State.chatStyleSig = styleSig;
        State.chatStyleApplied = true;
        State.chatStylePanel = chatPanel;
    }

    function UpdateDamageReportOffsets(root, cfg) {
        var livePanel = (root && root.FindChildTraverse) ? root.FindChildTraverse("CitadelHudDamageReport") : null;
        var damageReportPanel = IsPanelValid(livePanel) ? livePanel : (GetCachedPanel("damageReportPanel"));
        if (damageReportPanel !== GetCachedPanel("damageReportPanel")) {
            SetCachedPanel("damageReportPanel", damageReportPanel);
        }

        var previousPanel = IsPanelValid(State.damageReportOffsetPanel) ? State.damageReportOffsetPanel : null;
        if (previousPanel && previousPanel !== damageReportPanel) {
            ResetDamageReportOffsetRuntime(previousPanel);
        }

        if (!damageReportPanel) {
            State.damageReportOffsetSig = "";
            State.damageReportOffsetApplied = false;
            State.damageReportOffsetPanel = null;
            return;
        }

        var offsetX = (cfg.DAMAGE_REPORT_X_OFFSET === undefined || cfg.DAMAGE_REPORT_X_OFFSET === null)
            ? 0
            : Math.round(Number(cfg.DAMAGE_REPORT_X_OFFSET));
        var offsetY = (cfg.DAMAGE_REPORT_Y_OFFSET === undefined || cfg.DAMAGE_REPORT_Y_OFFSET === null)
            ? 0
            : Math.round(Number(cfg.DAMAGE_REPORT_Y_OFFSET));
        var styleSig = offsetX + "|" + offsetY;

        if (
            State.damageReportOffsetApplied &&
            State.damageReportOffsetPanel === damageReportPanel &&
            State.damageReportOffsetSig === styleSig
        ) {
            return;
        }

        damageReportPanel.style.x = String(offsetX) + "px";
        damageReportPanel.style.y = String(-offsetY) + "px";

        if (offsetX === 0 && offsetY === 0) {
            State.damageReportOffsetSig = "";
            State.damageReportOffsetApplied = false;
            State.damageReportOffsetPanel = null;
        } else {
            State.damageReportOffsetSig = styleSig;
            State.damageReportOffsetApplied = true;
            State.damageReportOffsetPanel = damageReportPanel;
        }
    }

    function IsStreetBrawlModeActive(root) {
        var gameplayHud = GetCachedPanel("gameplayHud");
        if (!gameplayHud && root) {
            gameplayHud = root.FindChildTraverse(PANEL_ID_GAMEPLAY_HUD);
            if (!gameplayHud) {
                gameplayHud = $.GetContextPanel ? $.GetContextPanel() : null;
            }
            SetCachedPanel("gameplayHud", gameplayHud);
        }
        if (gameplayHud && hasClassInHierarchy(gameplayHud, "gamemode_streetbrawl")) {
            return true;
        }
        return !!(root && root.BHasClass && root.BHasClass("gamemode_streetbrawl"));
    }

    function GetPanelClassTokens(panel) {
        if (!panel || !panel.GetAttributeString) return [];
        var classAttr = panel.GetAttributeString("class", "");
        if (!classAttr || classAttr.length === 0) return [];
        var split = classAttr.split(/\s+/);
        var out = [];
        for (var i = 0; i < split.length; i++) {
            var token = split[i];
            if (!token || token.length === 0) continue;
            out.push(token);
        }
        return out;
    }

    function SyncPanelClasses(source, target, cacheKey, seedClasses) {
        if (!source || !target) return;
        var prior = State.itemMirror.classCache[cacheKey] || [];
        var map = {};
        function addToken(token) {
            if (!token || token.length === 0) return;
            map[token] = true;
        }
        for (var i = 0; i < prior.length; i++) addToken(prior[i]);
        if (seedClasses) {
            for (var s = 0; s < seedClasses.length; s++) addToken(seedClasses[s]);
        }
        var fromAttr = GetPanelClassTokens(source);
        for (var a = 0; a < fromAttr.length; a++) addToken(fromAttr[a]);

        var tokens = Object.keys(map);
        for (var t = 0; t < tokens.length; t++) {
            var cls = tokens[t];
            target.SetHasClass(cls, source.BHasClass && source.BHasClass(cls));
        }
        State.itemMirror.classCache[cacheKey] = tokens;
    }

    function GetInlineStyleProperty(panel, propName) {
        if (!panel || !panel.GetAttributeString || !propName) return "";
        var styleText = panel.GetAttributeString("style", "");
        if (!styleText || styleText.length === 0) return "";
        var match = new RegExp(propName + "\\s*:\\s*([^;]+)", "i").exec(styleText);
        return match && match[1] ? match[1].trim() : "";
    }

    function ResolveMirrorItemSize(sourceIcon, sourceMod) {
        var sizePx = Math.round(Number(ITEM_MIRROR_ICON_BASE_SIZE_PX));
        if (!isFinite(sizePx) || sizePx <= 0) sizePx = 45;
        var sizeText = String(sizePx) + "px";
        return { width: sizeText, height: sizeText };
    }

    function ParseRadialClipEndDeg(clipText) {
        if (!clipText || clipText.length === 0) return null;
        var m = /,\s*([+\-]?\d+(?:\.\d+)?)\s*deg\s*\)/i.exec(String(clipText));
        if (!m || !m[1]) return null;
        var v = parseFloat(m[1]);
        return isFinite(v) ? v : null;
    }

    function ParseRadialClipStartDeg(clipText) {
        if (!clipText || clipText.length === 0) return null;
        var text = String(clipText);
        var m = /radial\s*\(\s*[^,]+,\s*([+\-]?\d+(?:\.\d+)?)\s*deg\s*,/i.exec(text);
        if ((!m || !m[1]) && text.indexOf(",") >= 0) {
            m = /,\s*([+\-]?\d+(?:\.\d+)?)\s*deg\s*,/i.exec(text);
        }
        if (!m || !m[1]) return null;
        var v = parseFloat(m[1]);
        return isFinite(v) ? v : null;
    }

    function ResolveRadialProgressDeg(clipText, previousDeg) {
        var startDeg = ParseRadialClipStartDeg(clipText);
        var endDeg = ParseRadialClipEndDeg(clipText);

        if (startDeg === null && endDeg === null) return null;
        if (startDeg === null) return endDeg;
        if (endDeg === null) return startDeg;

        if (!isFinite(startDeg) && !isFinite(endDeg)) return null;
        if (!isFinite(startDeg)) return endDeg;
        if (!isFinite(endDeg)) return startDeg;

        if (Math.abs(startDeg) <= 0.01 && endDeg > 0.01) return endDeg;
        if (Math.abs(endDeg) <= 0.01 && startDeg > 0.01) return startDeg;

        if (previousDeg !== null && isFinite(previousDeg)) {
            var ds = Math.abs(startDeg - previousDeg);
            var de = Math.abs(endDeg - previousDeg);
            if (ds < de) return startDeg;
            if (de < ds) return endDeg;
        }

        return (Math.abs(startDeg) >= Math.abs(endDeg)) ? startDeg : endDeg;
    }

    function TriggerItemMirrorReadyFlash(overlayPanel, debugKey) {
        if (!IsPanelValid(overlayPanel)) return;
        var key = debugKey ? String(debugKey) : "unknown";
        try {
            if (overlayPanel.SetHasClass) overlayPanel.SetHasClass("ready_flash", false);
            overlayPanel.style.visibility = "visible";
        } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        ItemMirrorFlashLog(key + " overlay flash trigger");
        $.Schedule(0.01, function() {
            if (!IsPanelValid(overlayPanel)) return;
            try {
                if (overlayPanel.SetHasClass) overlayPanel.SetHasClass("ready_flash", true);
                ItemMirrorFlashLog(key + " overlay class=ready_flash ON");
            } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
            $.Schedule((ITEM_MIRROR_READY_OVERLAY_FLASH_MS + 40) / 1000.0, function() {
                if (!IsPanelValid(overlayPanel)) return;
                try {
                    if (overlayPanel.SetHasClass) overlayPanel.SetHasClass("ready_flash", false);
                    ItemMirrorFlashLog(key + " overlay class=ready_flash OFF");
                } catch(e2) { QOL_WARN("core", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
            });
        });
    }

    function FormatDerivedCooldownSeconds(sec) {
        if (!isFinite(sec) || sec <= 0) return "";
        if (sec >= 1) return String(Math.ceil(sec));
        // Keep sub-1s smooth.
        var rounded = Math.round(sec * 10) / 10;
        return rounded.toFixed(1);
    }

    function ResetReloadCooldownEstimate() {
        State.reloadCdLastDeg = null;
        State.reloadCdLastMs = 0;
        State.reloadCdSlopeEma = null;
        State.reloadCdDisplayLock = null;
        State.reloadCdDirection = 0;
    }

    // UpdateReloadCooldownOverlay — reads the active reload progress bar from the HUD,
    // applies config-driven scale/opacity/offset, and manages EMA-smoothed reload duration display.
    function UpdateReloadCooldownOverlay(root, cfg) {
        var enabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_RELOAD_COOLDOWN"));
        var cooldownLabel = GetCachedPanel("reloadCooldownLabel");

        if (!enabled) {
            if (cooldownLabel) {
                cooldownLabel.style.visibility = "collapse";
                if (cooldownLabel.text !== "") cooldownLabel.text = "";
            }
            ResetReloadCooldownEstimate();
            return;
        }

        var reticleStatus = GetCachedPanel("reloadReticleStatus");
        if (!reticleStatus) {
            reticleStatus = root.FindChildTraverse("reticle_status");
            SetCachedPanel("reloadReticleStatus", reticleStatus);
        }
        var reloadProgressBar = GetCachedPanel("reloadProgressBar");
        if (!reloadProgressBar) {
            reloadProgressBar = reticleStatus ? reticleStatus.FindChildTraverse("attack_delayed_progress_bar") : null;
            if (!reloadProgressBar) {
                reloadProgressBar = root.FindChildTraverse("attack_delayed_progress_bar");
            }
            SetCachedPanel("reloadProgressBar", reloadProgressBar);
        }

        if (!reticleStatus || !reloadProgressBar) {
            if (cooldownLabel) {
                cooldownLabel.style.visibility = "collapse";
                if (cooldownLabel.text !== "") cooldownLabel.text = "";
            }
            ResetReloadCooldownEstimate();
            return;
        }

        if (!cooldownLabel) {
            cooldownLabel = reticleStatus.FindChildTraverse("QOLReloadCooldownText");
            if (!cooldownLabel) {
                cooldownLabel = $.CreatePanel("Label", reticleStatus, "QOLReloadCooldownText");
            }
            if (cooldownLabel) {
                cooldownLabel.hittest = false;
                cooldownLabel.hittestchildren = false;
                SetCachedPanel("reloadCooldownLabel", cooldownLabel);
            }
        }
        if (!cooldownLabel) {
            ResetReloadCooldownEstimate();
            return;
        }

        var cooldownOpacity = (cfg.RELOAD_COOLDOWN_OPACITY === undefined || cfg.RELOAD_COOLDOWN_OPACITY === null) ? 0.6 : parseFloat(cfg.RELOAD_COOLDOWN_OPACITY);
        if (!isFinite(cooldownOpacity)) cooldownOpacity = 0.6;
        if (cooldownOpacity < 0) cooldownOpacity = 0;
        if (cooldownOpacity > 1) cooldownOpacity = 1;
        var cooldownSize = (cfg.RELOAD_COOLDOWN_SIZE === undefined || cfg.RELOAD_COOLDOWN_SIZE === null) ? 28 : Math.round(Number(cfg.RELOAD_COOLDOWN_SIZE));
        if (!isFinite(cooldownSize)) cooldownSize = 28;
        if (cooldownSize < 16) cooldownSize = 16;
        if (cooldownSize > 60) cooldownSize = 60;
        var cooldownOffsetX = (cfg.RELOAD_COOLDOWN_X_OFFSET === undefined || cfg.RELOAD_COOLDOWN_X_OFFSET === null) ? 0 : Math.round(Number(cfg.RELOAD_COOLDOWN_X_OFFSET));
        if (!isFinite(cooldownOffsetX)) cooldownOffsetX = 0;
        if (cooldownOffsetX < -75) cooldownOffsetX = -75;
        if (cooldownOffsetX > 75) cooldownOffsetX = 75;
        var cooldownOffsetY = (cfg.RELOAD_COOLDOWN_Y_OFFSET === undefined || cfg.RELOAD_COOLDOWN_Y_OFFSET === null) ? 0 : Math.round(Number(cfg.RELOAD_COOLDOWN_Y_OFFSET));
        if (!isFinite(cooldownOffsetY)) cooldownOffsetY = 0;
        if (cooldownOffsetY < -75) cooldownOffsetY = -75;
        if (cooldownOffsetY > 75) cooldownOffsetY = 75;
        var cooldownStyleSig = cooldownOpacity.toFixed(2) + "|" + String(cooldownSize) + "|" + String(cooldownOffsetX) + "|" + String(cooldownOffsetY);
        if (State.reloadCooldownStyleSig !== cooldownStyleSig) {
            SetPanelOpacitySafe(cooldownLabel, cooldownOpacity, 0.6);
            cooldownLabel.style.fontSize = String(cooldownSize) + "px";
            cooldownLabel.style.marginLeft = String(cooldownOffsetX) + "px";
            cooldownLabel.style.marginTop = String(-cooldownOffsetY) + "px";
            State.reloadCooldownStyleSig = cooldownStyleSig;
        }

        var clipText = "";
        try {
            if (reloadProgressBar.style && reloadProgressBar.style.clip) {
                clipText = String(reloadProgressBar.style.clip);
            }
        } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        if (!clipText || clipText.length === 0) {
            clipText = GetInlineStyleProperty(reloadProgressBar, "clip");
        }

        var currentDeg = ParseRadialClipStartDeg(clipText);
        if (currentDeg === null) {
            currentDeg = ParseRadialClipEndDeg(clipText);
        }
        var hasActiveReload = false;
        if (reloadProgressBar.BHasClass && reloadProgressBar.BHasClass("has_active_reload")) hasActiveReload = true;
        if (!hasActiveReload) {
            hasActiveReload = hasClassInHierarchy(reloadProgressBar, "has_active_reload");
        }
        if (!hasActiveReload) {
            hasActiveReload =
                hasClassInHierarchy(reloadProgressBar, "attack_delayed") ||
                hasClassInHierarchy(reloadProgressBar, "reloading");
        }
        if (!hasActiveReload) {
            try {
                hasActiveReload = (String(reloadProgressBar.style.visibility || "").toLowerCase() === "visible");
            } catch(e0v) { QOL_WARN("core", "op failed: " + (e0v && e0v.message ? e0v.message : String(e0v || ""))); }
        }
        if (!hasActiveReload || currentDeg === null || !isFinite(currentDeg) || currentDeg <= 0.01) {
            cooldownLabel.style.visibility = "collapse";
            if (cooldownLabel.text !== "") cooldownLabel.text = "";
            ResetReloadCooldownEstimate();
            return;
        }

        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        if (State.reloadCdLastDeg !== null && State.reloadCdLastMs > 0) {
            var dtSec = (nowMs - State.reloadCdLastMs) / 1000.0;
            var dDeg = State.reloadCdLastDeg - currentDeg;

            // Wrap/reset protection when a new reload starts from near-zero to near-360.
            if (dDeg < -180 || dDeg > 360) {
                State.reloadCdSlopeEma = null;
                State.reloadCdDisplayLock = null;
                State.reloadCdDirection = 0;
            } else if (dtSec > 0.01 && dtSec < 1.0 && Math.abs(dDeg) > 0.01) {
                if (State.reloadCdDirection === 0 && Math.abs(dDeg) >= 0.05) {
                    State.reloadCdDirection = (dDeg > 0) ? 1 : -1; // 1: decreasing deg, -1: increasing deg
                }
                var signedDelta = 0;
                if (State.reloadCdDirection >= 0 && dDeg > 0) {
                    signedDelta = dDeg;
                } else if (State.reloadCdDirection <= 0 && dDeg < 0) {
                    signedDelta = -dDeg;
                }
                if (signedDelta > 0) {
                    var slope = signedDelta / dtSec;
                    if (isFinite(slope) && slope > 0.001 && slope < 5000) {
                        State.reloadCdSlopeEma = (State.reloadCdSlopeEma === null)
                            ? slope
                            : ((State.reloadCdSlopeEma * 0.75) + (slope * 0.25));
                    }
                }
            }
        }
        State.reloadCdLastDeg = currentDeg;
        State.reloadCdLastMs = nowMs;

        var cooldownText = "";
        if (State.reloadCdSlopeEma !== null && State.reloadCdSlopeEma > 0.001) {
            var remainingDeg = currentDeg;
            if (State.reloadCdDirection < 0) {
                remainingDeg = 360 - currentDeg;
            }
            if (!isFinite(remainingDeg) || remainingDeg < 0) remainingDeg = 0;
            var remainingSec = remainingDeg / State.reloadCdSlopeEma;
            var displayRaw = FormatDerivedCooldownSeconds(remainingSec);
            var n = parseFloat(displayRaw);
            if (isFinite(n)) {
                if (n >= 1) {
                    var intVal = Math.ceil(n);
                    if (State.reloadCdDisplayLock !== null && isFinite(State.reloadCdDisplayLock)) {
                        intVal = Math.min(intVal, State.reloadCdDisplayLock);
                    }
                    State.reloadCdDisplayLock = intVal;
                    cooldownText = String(intVal);
                } else {
                    if (State.reloadCdDisplayLock !== null && isFinite(State.reloadCdDisplayLock)) {
                        n = Math.min(n, State.reloadCdDisplayLock);
                    }
                    State.reloadCdDisplayLock = n;
                    cooldownText = (Math.round(n * 10) / 10).toFixed(1);
                }
            } else {
                cooldownText = displayRaw;
            }
        }

        if (cooldownText && cooldownText.length > 0) {
            if (cooldownLabel.text !== cooldownText) cooldownLabel.text = cooldownText;
            cooldownLabel.style.visibility = "visible";
        } else {
            cooldownLabel.style.visibility = "collapse";
            if (cooldownLabel.text !== "") cooldownLabel.text = "";
        }
    }

    function UpdateReloadCircleExceptionState(root, cfg) {
        var hideReloadCircleEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_HIDE_RELOAD_CIRCLE"));
        if (!hideReloadCircleEnabled) {
            SetPanelClassCached(root, State.rootClassCache, "hide_reload_circle_exception_active", false);
            SetCachedPanel("activeReloadProgressBar", null);
            return;
        }

        var activeReloadBar = GetCachedPanel("activeReloadProgressBar");
        if (!activeReloadBar) {
            activeReloadBar = root.FindChildTraverse("active_reload_progress_bar");
            SetCachedPanel("activeReloadProgressBar", activeReloadBar);
        }

        var hasActiveReloadClass = false;
        if (activeReloadBar) {
            if (activeReloadBar.BHasClass && activeReloadBar.BHasClass("has_active_reload")) hasActiveReloadClass = true;
            if (!hasActiveReloadClass) hasActiveReloadClass = hasClassInHierarchy(activeReloadBar, "has_active_reload");
        }

        var attackDelayedActive = false;
        if (root.BHasClass && root.BHasClass("attack_delayed")) attackDelayedActive = true;
        if (!attackDelayedActive && activeReloadBar) attackDelayedActive = hasClassInHierarchy(activeReloadBar, "attack_delayed");

        var reloadingActive = false;
        if (root.BHasClass && root.BHasClass("reloading")) reloadingActive = true;
        if (!reloadingActive && activeReloadBar) reloadingActive = hasClassInHierarchy(activeReloadBar, "reloading");

        var exceptionActive = hasActiveReloadClass && attackDelayedActive && reloadingActive;
        SetPanelClassCached(root, State.rootClassCache, "hide_reload_circle_exception_active", exceptionActive);
    }

    function PanelHasAllClasses(panel, classes) {
        if (!panel || !panel.BHasClass) return false;
        for (var i = 0; i < classes.length; i++) {
            if (!panel.BHasClass(classes[i])) return false;
        }
        return true;
    }

    function IsConnectedToHideout(root) {
        // Game.GetMapInfo confirmed absent — use HUD panel classes for hideout detection.
        var hud = GetCachedPanel("cachedHudPanel");
        if (!hud && root && root.FindChildTraverse) {
            hud = root.FindChildTraverse(PANEL_ID_HUD);
            SetCachedPanel("cachedHudPanel", hud);
        }
        if (hud && (hud.BHasClass("connectedToHideout") || hud.BHasClass("InHideout"))) return true;
        return root.BHasClass("connectedToHideout") || root.BHasClass("InHideout");
    }

    function IsStartupLoaderInActiveMatchContext(root) {
        if (!root) return false;
        var hud = root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_HUD) : null;
        var gameplayHud = ResolveCachedPanel(root, "gameplayHud", PANEL_ID_GAMEPLAY_HUD)
        var hideout = IsConnectedToHideout(root);

        var hasPanelClass = function(panel, className) {
            return !!(panel && panel.BHasClass && panel.BHasClass(className));
        };
        var hasAnyClass = function(className) {
            if (!className) return false;
            if (IsHudClassActive(root, className)) return true;
            if (hasPanelClass(hud, className)) return true;
            if (hasPanelClass(gameplayHud, className)) return true;
            return false;
        };
        var hasAnyClasses = function(classList) {
            for (var i = 0; i < classList.length; i++) {
                if (hasAnyClass(classList[i])) return true;
            }
            return false;
        };

        // Hard match signals: if any of these are present, suppress startup loader immediately.
        // Exception: the hideout sandbox uses GameStateGameInProgress internally
        // (it spawns a local server with bots), so skip suppression when in hideout.
        if (!hideout && hasAnyClasses([
            "GameStateGameInProgress",
            "GameStatePostGame",
            "GameStatePostGamePlayOfTheGame",
            "inPostGame"
        ])) {
            return true;
        }

        // Soft signals: only trust these when hideout isn't explicitly active.
        if (!hideout && hasAnyClasses([
            "connectedToGame",
            "joined_team",
            "GameStatePreGame",
            "GameStatePreGameWait",
            "GameStateWaitForMapToLoad"
        ])) {
            return true;
        }

        return false;
    }

    function ParseClockSeconds(text) {
        if (!text || typeof text !== "string") return 0;
        var m = text.match(/(\d+):(\d{1,2})/);
        if (!m) return 0;
        var mm = parseInt(m[1], 10) || 0;
        var ss = parseInt(m[2], 10) || 0;
        if (ss > 59) ss = ss % 60;
        return (mm * 60) + ss;
    }

    function GetGameSecondsForUrn(root) {
        // Game.GetGameTime/Game.Time and GameUI.GetGameTime confirmed absent.
        // Fall back to UI panel text parsing.
        var gameTimePanel = GetCachedPanel("gameTime");
        if (!gameTimePanel && root) {
            gameTimePanel = root.FindChildTraverse("HudGameTime") || root.FindChildTraverse("GameTime");
            SetCachedPanel("gameTime", gameTimePanel);
        }
        if (gameTimePanel && gameTimePanel.text) {
            return ParseClockSeconds(gameTimePanel.text);
        }
        return 0;
    }

    function RefreshUrnTrackerScoreCache(root, nowMs) {
        if (!root) return;
        var nextSearchMs = Number(State.urnTrackerNextPanelSearchMs) || 0;

        var teamsContainer = GetCachedPanel("urnTrackerTeamsContainer");
        var friendlyTeamPanel = GetCachedPanel("urnTrackerFriendlyTeamPanel");
        var enemyTeamPanel = GetCachedPanel("urnTrackerEnemyTeamPanel");
        var friendlyLabels = Array.isArray(State.cachedPanels.urnTrackerFriendlyGoldLabels) ? State.cachedPanels.urnTrackerFriendlyGoldLabels : null;
        var enemyLabels = Array.isArray(State.cachedPanels.urnTrackerEnemyGoldLabels) ? State.cachedPanels.urnTrackerEnemyGoldLabels : null;

        var friendlyLabelsOk = friendlyLabels && friendlyLabels.length > 0 && friendlyLabels.every(function(p) { return IsPanelValid(p); });
        var enemyLabelsOk = enemyLabels && enemyLabels.length > 0 && enemyLabels.every(function(p) { return IsPanelValid(p); });

        var shouldRescan = nowMs >= nextSearchMs || !teamsContainer || !friendlyTeamPanel || !enemyTeamPanel || !friendlyLabelsOk || !enemyLabelsOk;
        if (!shouldRescan) return;

        var topBar = GetCachedPanel("topBarPanel");
        if (!topBar && root.FindChildTraverse) {
            topBar = root.FindChildTraverse(PANEL_ID_TOP_BAR) || null;
            SetCachedPanel("topBarPanel", topBar);
        }
        if (!topBar) return;

        teamsContainer = topBar.FindChildTraverse ? (topBar.FindChildTraverse("TeamsContainer") || null) : null;
        SetCachedPanel("urnTrackerTeamsContainer", teamsContainer);

        if (!teamsContainer) {
            State.urnTrackerNextPanelSearchMs = nowMs + URN_TRACKER_PANEL_CACHE_REFRESH_MS;
            return;
        }

        var friendlyCandidates = teamsContainer.FindChildrenWithClassTraverse ? (teamsContainer.FindChildrenWithClassTraverse("friend") || []) : [];
        if (friendlyCandidates.length === 0 && teamsContainer.FindChildrenWithClassTraverse) {
            friendlyCandidates = teamsContainer.FindChildrenWithClassTraverse("team1") || [];
        }
        var enemyCandidates = teamsContainer.FindChildrenWithClassTraverse ? (teamsContainer.FindChildrenWithClassTraverse("enemy") || []) : [];
        if (enemyCandidates.length === 0 && teamsContainer.FindChildrenWithClassTraverse) {
            enemyCandidates = teamsContainer.FindChildrenWithClassTraverse("team2") || [];
        }

        friendlyTeamPanel = friendlyCandidates.length > 0 ? friendlyCandidates[0] : null;
        enemyTeamPanel = enemyCandidates.length > 0 ? enemyCandidates[0] : null;
        friendlyLabels = (friendlyTeamPanel && friendlyTeamPanel.FindChildrenWithClassTraverse) ? (friendlyTeamPanel.FindChildrenWithClassTraverse("hiddenGoldValue") || []) : [];
        enemyLabels = (enemyTeamPanel && enemyTeamPanel.FindChildrenWithClassTraverse) ? (enemyTeamPanel.FindChildrenWithClassTraverse("hiddenGoldValue") || []) : [];

        SetCachedPanel("urnTrackerFriendlyTeamPanel", friendlyTeamPanel);
        SetCachedPanel("urnTrackerEnemyTeamPanel", enemyTeamPanel);
        State.cachedPanels.urnTrackerFriendlyGoldLabels = friendlyLabels;
        State.cachedPanels.urnTrackerEnemyGoldLabels = enemyLabels;
        State.urnTrackerNextPanelSearchMs = nowMs + URN_TRACKER_PANEL_CACHE_REFRESH_MS;
    }

    function GetCachedUrnTeamNetworthValue(labelsKey) {
        var labels = Array.isArray(State.cachedPanels[labelsKey]) ? State.cachedPanels[labelsKey] : [];
        if (labels.length === 0) return 0;
        var total = 0;
        for (var i = 0; i < labels.length; i++) {
            if (!IsPanelValid(labels[i])) return 0;
            var v = parseInt(String(labels[i].text).replace(/,/g, ""), 10);
            if (isFinite(v)) total += v;
        }
        return total;
    }

    function EnsureUrnTrackerOverlay(root) {
        var panel = GetCachedPanel("urnTrackerPanel");
        var label = GetCachedPanel("urnTrackerLabel");
        if (panel && label && label.GetParent && label.GetParent() === panel) return panel;

        panel = root ? root.FindChildTraverse("UrnTracker") : null;
        if (!panel) {
            var parent = null;
            var topBar = root ? root.FindChildTraverse(PANEL_ID_TOP_BAR) : null;
            if (topBar) {
                parent = FindFirstPanelByClass(topBar, "TeamNetworth");
            }
            if (!parent && root) {
                parent = FindFirstPanelByClass(root, "TeamNetworth");
            }
            if (!parent && topBar) {
                parent = topBar;
            }
            if (!parent) return null;
            panel = $.CreatePanel("Panel", parent, "UrnTracker", {
                "class": "UrnTracker",
                hittest: "false",
                hittestchildren: "false",
                visible: "true"
            });
        }
        if (!panel) return null;

        label = panel.FindChildTraverse("UrnTrackerLabel");
        if (!label) {
            label = $.CreatePanel("Label", panel, "UrnTrackerLabel", {
                "class": "UrnTrackerLabel",
                text: "--"
            });
        }

        var soulIcon = panel.FindChildTraverse("UrnTrackerSoulIcon");
        if (!soulIcon) {
            soulIcon = $.CreatePanel("Panel", panel, "UrnTrackerSoulIcon", {
                "class": "UrnTrackerSoulIcon", hittest: "false"
            });
        }

        SetCachedPanel("urnTrackerPanel", panel);
        SetCachedPanel("urnTrackerLabel", label);
        return panel;
    }

    function SetUrnTrackerVisual(panel, label, text, moodClass) {
        if (!panel || !label) return;

        var nextText = (text === undefined || text === null) ? "--" : String(text);
        if (State.urnTrackerLastText !== nextText) {
            label.text = nextText;
            State.urnTrackerLastText = nextText;
        }

        var nextMood = moodClass || "neutral";
        if (State.urnTrackerLastClass !== nextMood) {
            panel.RemoveClass("good");
            panel.RemoveClass("bad");
            panel.RemoveClass("neutral");
            panel.AddClass(nextMood);
            State.urnTrackerLastClass = nextMood;
        }

        if (!panel.BHasClass || !panel.BHasClass("show")) panel.AddClass("show");
        panel.visible = true;
    }

    function HideUrnTrackerOverlay(root) {
        var panel = GetCachedPanel("urnTrackerPanel");
        if (!panel && root && root.FindChildTraverse) {
            panel = root.FindChildTraverse("UrnTracker");
            if (IsPanelValid(panel)) {
                SetCachedPanel("urnTrackerPanel", panel);
            }
        }
        if (IsPanelValid(panel)) panel.visible = false;
    }

    function ComputeUrnTrackerState(root, nowMs) {
        var now = isFinite(Number(nowMs)) ? Number(nowMs) : (Date.now ? Date.now() : (new Date()).getTime());
        if (now < (State.urnTrackerNextSampleMs || 0) && State.urnTrackerCachedState) {
            return State.urnTrackerCachedState;
        }

        RefreshUrnTrackerScoreCache(root, now);
        var friendlyVal = GetCachedUrnTeamNetworthValue("urnTrackerFriendlyGoldLabels");
        var enemyVal = GetCachedUrnTeamNetworthValue("urnTrackerEnemyGoldLabels");
        var gameSec = GetGameSecondsForUrn(root);
        var gameMin = gameSec / 60.0;
        var mood = "neutral";
        var display = "--";
        var result = null;

        if (friendlyVal <= 0 && enemyVal <= 0) {
            result = {
                friendlyVal: friendlyVal,
                enemyVal: enemyVal,
                mood: "neutral",
                display: "--",
                debugText: "--"
            };
            State.urnTrackerCachedState = result;
            State.urnTrackerNextSampleMs = now + URN_TRACKER_SAMPLE_INTERVAL_MS;
            return result;
        }

        if (friendlyVal > 0 && enemyVal <= 0) {
            result = {
                friendlyVal: friendlyVal,
                enemyVal: enemyVal,
                mood: "good",
                display: "100%",
                debugText: "100%"
            };
            State.urnTrackerCachedState = result;
            State.urnTrackerNextSampleMs = now + URN_TRACKER_SAMPLE_INTERVAL_MS;
            return result;
        }

        if (enemyVal > 0 && friendlyVal <= 0) {
            result = {
                friendlyVal: friendlyVal,
                enemyVal: enemyVal,
                mood: "bad",
                display: "-100.0%",
                debugText: "-inf"
            };
            State.urnTrackerCachedState = result;
            State.urnTrackerNextSampleMs = now + URN_TRACKER_SAMPLE_INTERVAL_MS;
            return result;
        }

        var higher = Math.max(friendlyVal, enemyVal);
        var lower = Math.min(friendlyVal, enemyVal);
        var diffPct = 0;
        if (higher > 0) {
            diffPct = ((higher - lower) / higher) * 100;
            if (friendlyVal < enemyVal) diffPct *= -1;
        }

        var threshold = (gameMin < 15) ? 15 : 10;
        if (diffPct >= threshold) mood = "good";
        else if (diffPct <= -threshold) mood = "bad";

        display = (diffPct > 0 ? "+" : "") + diffPct.toFixed(1) + "%";
        result = {
            friendlyVal: friendlyVal,
            enemyVal: enemyVal,
            mood: mood,
            display: display,
            debugText: display
        };
        State.urnTrackerCachedState = result;
        State.urnTrackerNextSampleMs = now + URN_TRACKER_SAMPLE_INTERVAL_MS;
        return result;
    }

    function UpdateUrnTrackerOverlay(root, cfg, nowMs) {
        if (!root) return;
        var enabledVal = Number(cfg ? cfg.ENABLE_URN_DIFF : 0);
        if (!isFinite(enabledVal)) enabledVal = 0;
        var enabled = (enabledVal === 1);
        var urnColorsEnabled = false;
        var inHideout = IsConnectedToHideout(root);

        if (!enabled || inHideout) {
            HideUrnTrackerOverlay(root);
            State.urnTrackerDisplayMode = inHideout ? "hideout" : "disabled";
            State.urnTrackerNextSampleMs = 0;
            State.urnTrackerCachedState = null;
            var hiddenSig = "hidden|diff=" + String(enabled ? 1 : 0) + "|colors=" + String(urnColorsEnabled ? 1 : 0) + "|hideout=" + String(inHideout);
            if (State.urnTrackerLastDebugSig !== hiddenSig) {
                UrnTrackerLog(hiddenSig);
                State.urnTrackerLastDebugSig = hiddenSig;
            }
            return;
        }

        var urnState = ComputeUrnTrackerState(root, nowMs);

        var panel = EnsureUrnTrackerOverlay(root);
        var label = GetCachedPanel("urnTrackerLabel");
        if (!panel || !label) {
            var missSig = "missing|diff=1|colors=" + String(urnColorsEnabled ? 1 : 0) + "|hideout=0";
            if (State.urnTrackerLastDebugSig !== missSig) {
                UrnTrackerLog("overlay missing (panelOrLabel). " + missSig);
                State.urnTrackerLastDebugSig = missSig;
            }
            return;
        }

        SetUrnTrackerVisual(panel, label, urnState.display, urnState.mood);
        State.urnTrackerDisplayMode = "active";
        var activeSig = "active|f=" + String(urnState.friendlyVal) + "|e=" + String(urnState.enemyVal) + "|text=" + urnState.debugText + "|mood=" + urnState.mood + "|colors=" + String(urnColorsEnabled ? 1 : 0);
        if (State.urnTrackerLastDebugSig !== activeSig) {
            UrnTrackerLog(activeSig);
            State.urnTrackerLastDebugSig = activeSig;
        }
    }

    function NeedsUrnTrackerRuntimeWork(cfg) {
        if (IsCfgEnabled(cfg, "ENABLE_URN_DIFF")) return true;
        return !!(
            State.urnTrackerDisplayMode === "active" ||
            (GetCachedPanel("urnTrackerPanel") && State.urnTrackerDisplayMode !== "disabled")
        );
    }

    function EnsureSpmState() {
        if (!State.spm.playerHistory || !State.spm.teamHistory) {
            var histories = [];
            for (var i = 0; i < SPM_MAX_PLAYERS; i++) histories.push([]);
            State.spm.playerHistory = histories;
            State.spm.teamHistory = {
                friendly: [],
                enemy: []
            };
        }
        if (!State.spm.playerPanels) {
            State.spm.playerPanels = new Array(SPM_MAX_PLAYERS);
        }
        if (!State.spm.playerDisplayLabels) {
            State.spm.playerDisplayLabels = new Array(SPM_MAX_PLAYERS);
        }
        if (!State.spm.playerTeamByIndex) {
            State.spm.playerTeamByIndex = new Array(SPM_MAX_PLAYERS);
        }
        if (!State.spm.playerHiddenGoldLabels) {
            State.spm.playerHiddenGoldLabels = new Array(SPM_MAX_PLAYERS);
        }
        if (!State.spm.playerSoulsLabels) {
            State.spm.playerSoulsLabels = new Array(SPM_MAX_PLAYERS);
        }
        if (!isFinite(State.spm.playerRefreshCursor)) {
            State.spm.playerRefreshCursor = 0;
        }
        if (!isFinite(State.spm.playerRefreshRemaining)) {
            State.spm.playerRefreshRemaining = 0;
        }
        if (State.spm.needsFullPlayerCache === undefined || State.spm.needsFullPlayerCache === null) {
            State.spm.needsFullPlayerCache = true;
        }
    }


    function ParseSpmNumber(valueText) {
        if (!valueText) return 0;
        var raw = String(valueText).replace(/,/g, "").trim().toLowerCase();
        if (raw.length === 0) return 0;
        var scale = 1;
        var suffix = raw.charAt(raw.length - 1);
        if (suffix === "k" || suffix === "m" || suffix === "b") {
            raw = raw.substring(0, raw.length - 1);
            if (suffix === "k") scale = 1000;
            else if (suffix === "m") scale = 1000000;
            else if (suffix === "b") scale = 1000000000;
        }
        var v = parseFloat(raw);
        return isFinite(v) ? (v * scale) : 0;
    }

    function ParseUnsecuredSoulsValue(valueText) {
        return Math.max(0, Math.round(ParseSpmNumber(valueText)));
    }

    function EstimateUnsecuredSoulsEtaFallbackSec(souls, gameMin) {
        var remaining = Math.max(0, Number(souls) || 0);
        if (remaining <= 0) return 0;

        var minuteScale = 1 + (Math.max(0, Number(gameMin) || 0) * UNSECURED_SOULS_FALLBACK_FLAT_GROWTH);
        var flatRate = UNSECURED_SOULS_FALLBACK_BASE_FLAT * minuteScale;
        var perSecond = (remaining * UNSECURED_SOULS_FALLBACK_PCT_DRAIN) + flatRate;
        if (!isFinite(perSecond) || perSecond <= 0) return 0;
        return remaining / perSecond;
    }

    function GetUnsecuredSoulsDangerLevel(sourcePanel, souls) {
        var current = sourcePanel;
        while (current) {
            if (current.BHasClass) {
                if (current.BHasClass("death_penalty_gold_danger_level_4")) return 4;
                if (current.BHasClass("death_penalty_gold_danger_level_3")) return 3;
                if (current.BHasClass("death_penalty_gold_danger_level_2")) return 2;
                if (current.BHasClass("death_penalty_gold_danger_level_1")) return 1;
            }
            current = current.GetParent ? current.GetParent() : null;
        }

        if (souls >= UNSECURED_SOULS_THRESH_RED) return 3;
        if (souls >= UNSECURED_SOULS_THRESH_YELLOW) return 2;
        if (souls > 0) return 1;
        return 0;
    }


    function GetSoulValueFromLabels(hiddenGoldLabel, soulsLabel) {
        var soulValue = 0;
        if (hiddenGoldLabel && hiddenGoldLabel.text) soulValue = ParseSpmNumber(hiddenGoldLabel.text);
        if (soulValue === 0 && soulsLabel && soulsLabel.text) soulValue = ParseSpmNumber(soulsLabel.text);
        return soulValue;
    }

    function DetectTopBarPlayerTeam(playerPanel) {
        var p = playerPanel;
        var teamGuard = 0;
        while (p && p.GetParent && teamGuard < 64) {
            if (p.id === "TeamFriendly") return "friendly";
            if (p.id === "TeamEnemy") return "enemy";
            p = p.GetParent();
            teamGuard++;
        }
        if (teamGuard >= 64) QOL_WARN("topbar", "DetectTopBarPlayerTeam: parent-chain walk hit guard limit");
        return null;
    }

    function IsUltCooldownTrackedIndex(index) {
        return index >= ULT_CD_SLOT_MIN_INDEX && index <= ULT_CD_SLOT_MAX_INDEX;
    }

    function EnsureTopBarPlayerPanelCacheState(root) {
        if (State.topbarPlayerPanelRoot && State.topbarPlayerPanelRoot !== root) {
            State.topbarPlayerPanels = null;
            State.topbarPlayerPanelLastScanMs = null;
        }
        State.topbarPlayerPanelRoot = root || null;
        if (!State.topbarPlayerPanels) State.topbarPlayerPanels = new Array(SPM_MAX_PLAYERS);
        if (!State.topbarPlayerPanelLastScanMs) State.topbarPlayerPanelLastScanMs = new Array(SPM_MAX_PLAYERS);
    }

    function GetTopBarPlayerPanel(root, index, nowMs, forceRefresh) {
        if (!root || index < 0 || index >= SPM_MAX_PLAYERS) return null;
        EnsureTopBarPlayerPanelCacheState(root);
        var cached = IsPanelValid(State.topbarPlayerPanels[index]) ? State.topbarPlayerPanels[index] : null;
        var now = Number(nowMs);
        if (!isFinite(now) || now <= 0) now = PerfNowMs();
        var lastScanMs = Number(State.topbarPlayerPanelLastScanMs[index]) || 0;
        // Fix 11: detect time-source mismatch between Date.now() (epoch ms,
        // ~1.7e12) and PerfNowMs() (game-relative, ~0–1e7).  When the two
        // sources are mixed in the same cache the "recently scanned" check
        // produces a huge negative delta that is always < REFRESH_MS, causing
        // a permanent freeze where the cached null is never re-scanned.
        // We treat the cache as stale whenever the absolute delta exceeds
        // 24 h — a value no sane game-relative or epoch timestamp can
        // legitimately span within a single session.
        if (lastScanMs > 0 && (now < lastScanMs) && (lastScanMs - now) > 86400000) {
            lastScanMs = 0;
        }
        var recentlyScanned = lastScanMs > 0 && (now - lastScanMs) < TOPBAR_PLAYER_PANEL_CACHE_REFRESH_MS;
        if (cached && (!forceRefresh || recentlyScanned)) return cached;
        if (!forceRefresh && recentlyScanned) return cached;
        if (!root.FindChildTraverse) {
            State.topbarPlayerPanels[index] = null;
            State.topbarPlayerPanelLastScanMs[index] = now;
            return null;
        }
        var playerPanel = root.FindChildTraverse("TopBarPlayer" + index) || null;
        State.topbarPlayerPanels[index] = playerPanel || null;
        State.topbarPlayerPanelLastScanMs[index] = now;
        return playerPanel || null;
    }

    var ULT_CD_MISSING_RECHECK_MS = 3000;
    var ULT_CD_DEBUG_SPIKE_MS = 2;
    var ULT_CD_DEBUG_THROTTLE_MS = 1000;
    var ultCdDebugLastLogMs = 0;

    // -------------------------------------------------------------------------
    // Ultimate Cooldown Overlay — panel lookup helpers
    // -------------------------------------------------------------------------
    // We traverse through known intermediate IDs with FindChild (non-recursive)
    // and verify that the returned panels actually descend from the expected
    // player panel via a parent-walk.  This defends against any cross-player
    // contamination if FindChildTraverse resolves a duplicate ID to a different
    // player's subtree.
    //
    // Player panel DOM path:
    //   CitadelHudTopBarPlayer
    //     PlayerDetailsContainer
    //       StatusRow
    //         UltimateStatus
    //           UltimateStatusBG
    //             UltimateCooldownTextHidden  (Label — game-managed binding)
    //         UltimateCooldownTextShown       (Label — we write this)

    function FindUltCooldownElements(playerPanel) {
        var statusRow = playerPanel && playerPanel.FindChildTraverse
            ? playerPanel.FindChildTraverse("StatusRow")
            : null;
        if (!statusRow || !IsPanelValid(statusRow)) return null;

        // UltimateCooldownTextShown is a direct child of StatusRow
        var elShown = statusRow.FindChild
            ? statusRow.FindChild("UltimateCooldownTextShown")
            : null;

        // UltimateCooldownTextHidden is nested: StatusRow > UltimateStatus > UltimateStatusBG > label
        var ultimateStatus = statusRow.FindChild
            ? statusRow.FindChild("UltimateStatus")
            : null;
        var elHidden = null;
        if (ultimateStatus && IsPanelValid(ultimateStatus) && ultimateStatus.FindChild) {
            var bg = ultimateStatus.FindChild("UltimateStatusBG");
            if (bg && IsPanelValid(bg) && bg.FindChild) {
                elHidden = bg.FindChild("UltimateCooldownTextHidden");
            }
        }

        if (!elShown || !IsPanelValid(elShown) || !elHidden || !IsPanelValid(elHidden)) return null;

        // Verify both elements actually descend from the player panel we were
        // given (belt-and-suspenders against any ancestor mismatch).
        if (!IsDescendantOf(elShown, playerPanel) || !IsDescendantOf(elHidden, playerPanel)) return null;

        return { elHidden: elHidden, elShown: elShown };
    }

    function UpdateUltimateCooldownOverlay(root, cfg) {
        if (!cfg || Number(cfg.ENABLE_ULT_COOLDOWNS) !== 1) return;
        var fnStart = PerfNowMs();
        if (!State.ultCdSlotCache) State.ultCdSlotCache = new Array(ULT_CD_MAX_PLAYERS);
        if (!State.ultCdSlotNextRecheckMs) State.ultCdSlotNextRecheckMs = new Array(ULT_CD_MAX_PLAYERS);
        var slots = State.ultCdSlotCache;
        var recheckMs = State.ultCdSlotNextRecheckMs;
        var nowMs = PerfNowMs();
        var debugParts = [];
        // Periodic full reset every 30 s so transient misses eventually self-heal
        if (nowMs > (State.ultCdSlotFullRescanAtMs || 0)) {
            for (var ri = 0; ri < ULT_CD_MAX_PLAYERS; ri++) { slots[ri] = undefined; recheckMs[ri] = 0; }
            State.ultCdSlotFullRescanAtMs = nowMs + ULT_CD_FULL_RESCAN_MS;
        }
        for (var i = 0; i < ULT_CD_MAX_PLAYERS; i++) {
            var slotStart = PerfNowMs();
            var slot = slots[i];
            var didTraverse = false;
            if (!slot || !IsPanelValid(slot.elHidden) || !IsPanelValid(slot.elShown)) {
                if (slot === false && nowMs < (recheckMs[i] || 0)) continue;
                didTraverse = true;
                var playerPanel = GetTopBarPlayerPanel(root, i, nowMs, false);
                if (!playerPanel) {
                    slots[i] = false;
                    recheckMs[i] = nowMs + ULT_CD_MISSING_RECHECK_MS;
                    if (ULT_CD_DEBUG_ENABLED) debugParts.push(i + ":noPlayer(" + (PerfNowMs() - slotStart).toFixed(2) + "ms)");
                    continue;
                }
                var els = FindUltCooldownElements(playerPanel);
                if (!els) {
                    slots[i] = false;
                    recheckMs[i] = nowMs + ULT_CD_MISSING_RECHECK_MS;
                    if (ULT_CD_DEBUG_ENABLED) debugParts.push(i + ":noEl(" + (PerfNowMs() - slotStart).toFixed(2) + "ms)");
                    continue;
                }
                slot = els;
                slots[i] = slot;
            }
            var cd = String(Number(slot.elHidden.text) + 1);
            if (slot.elShown.text !== cd) slot.elShown.text = cd;
            var slotMs = PerfNowMs() - slotStart;
            if (ULT_CD_DEBUG_ENABLED && slotMs >= ULT_CD_DEBUG_SPIKE_MS) debugParts.push(i + (didTraverse ? ":traverse(" : ":cached(") + slotMs.toFixed(2) + "ms)");
        }
        var fnMs = PerfNowMs() - fnStart;
        if (ULT_CD_DEBUG_ENABLED && fnMs >= ULT_CD_DEBUG_SPIKE_MS) {
            if (nowMs - ultCdDebugLastLogMs >= ULT_CD_DEBUG_THROTTLE_MS) {
                ultCdDebugLastLogMs = nowMs;
                $.Msg("[QOLLock][UltimateCooldownDebug] spike total=" + fnMs.toFixed(2) + "ms slots=[" + (debugParts.length ? debugParts.join(" ") : "none") + "]");
            }
        }
    }




    function RefreshSpmPlayerSlotCache(root, index) {
        if (!root || index < 0 || index >= SPM_MAX_PLAYERS) return;
        var playerPanel = GetTopBarPlayerPanel(root, index, PerfNowMs(), true);
        State.spm.playerPanels[index] = playerPanel || null;
        State.spm.playerDisplayLabels[index] = playerPanel && playerPanel.FindChildTraverse ? (playerPanel.FindChildTraverse("PlayerSPMDisplay") || null) : null;
        State.spm.playerTeamByIndex[index] = playerPanel ? DetectTopBarPlayerTeam(playerPanel) : null;
        State.spm.playerHiddenGoldLabels[index] = playerPanel && playerPanel.FindChildTraverse ? (playerPanel.FindChildTraverse("HiddenGoldValue") || null) : null;
        State.spm.playerSoulsLabels[index] = playerPanel && playerPanel.FindChildTraverse ? (playerPanel.FindChildTraverse("SoulsValue") || null) : null;
    }

    function RefreshSpmPanelCache(root, nowMs) {
        if (!root) return;
        EnsureSpmState();
        var shouldRefreshScorePanels =
            !IsPanelValid(State.spm.cachedFriendlyScore) ||
            !IsPanelValid(State.spm.cachedEnemyScore) ||
            !IsPanelValid(State.spm.cachedFriendlyLabel) ||
            !IsPanelValid(State.spm.cachedEnemyLabel) ||
            nowMs >= (State.spm.panelCacheNextMs || 0);

        if (shouldRefreshScorePanels) {
            State.spm.cachedFriendlyScore = root.FindChildTraverse("TeamScoreFriendly") || null;
            State.spm.cachedEnemyScore = root.FindChildTraverse("TeamScoreEnemy") || null;
            State.spm.cachedFriendlyLabel = State.spm.cachedFriendlyScore ? (State.spm.cachedFriendlyScore.FindChildTraverse("TeamSPMDisplay_friendly") || null) : null;
            State.spm.cachedEnemyLabel = State.spm.cachedEnemyScore ? (State.spm.cachedEnemyScore.FindChildTraverse("TeamSPMDisplay_enemy") || null) : null;
            State.spm.panelCacheNextMs = nowMs + SPM_PANEL_CACHE_REFRESH_MS + 137;
        }

        if (!State.spm.playerPanels) State.spm.playerPanels = new Array(SPM_MAX_PLAYERS);
        if (!State.spm.playerDisplayLabels) State.spm.playerDisplayLabels = new Array(SPM_MAX_PLAYERS);
        if (!State.spm.playerTeamByIndex) State.spm.playerTeamByIndex = new Array(SPM_MAX_PLAYERS);
        if (!State.spm.playerHiddenGoldLabels) State.spm.playerHiddenGoldLabels = new Array(SPM_MAX_PLAYERS);
        if (!State.spm.playerSoulsLabels) State.spm.playerSoulsLabels = new Array(SPM_MAX_PLAYERS);
        var remaining = Number(State.spm.playerRefreshRemaining);
        if (!isFinite(remaining) || remaining < 0) remaining = 0;
        if (State.spm.needsFullPlayerCache && remaining <= 0) {
            remaining = SPM_MAX_PLAYERS;
        } else if (shouldRefreshScorePanels && remaining <= 0) {
            remaining = SPM_MAX_PLAYERS;
        }
        if (remaining <= 0) return;

        var refreshCount = Math.min(SPM_PLAYER_CACHE_REFRESH_BATCH, remaining);
        var cursor = Number(State.spm.playerRefreshCursor);
        if (!isFinite(cursor) || cursor < 0 || cursor >= SPM_MAX_PLAYERS) cursor = 0;
        if (refreshCount < 1) refreshCount = 1;
        if (refreshCount > SPM_MAX_PLAYERS) refreshCount = SPM_MAX_PLAYERS;
        for (var i = 0; i < refreshCount; i++) {
            var index = (cursor + i) % SPM_MAX_PLAYERS;
            RefreshSpmPlayerSlotCache(root, index);
        }

        State.spm.playerRefreshCursor = (cursor + refreshCount) % SPM_MAX_PLAYERS;
        State.spm.playerRefreshRemaining = remaining - refreshCount;
        if (State.spm.playerRefreshRemaining <= 0 && State.spm.needsFullPlayerCache) {
            State.spm.needsFullPlayerCache = false;
        }
        State.topbarSoulSnapshot = null;
        State.topbarSoulSnapshotUntilMs = 0;
    }
    function EnsureMinimapOverlayAnchor(root) {
        if (!root || !root.FindChildTraverse) return null;
        var anchor = GetCachedPanel("minimapObjectiveTimersAnchor");
        if (!anchor) {
            anchor = root.FindChildTraverse("minimap_container");
            if (!anchor) anchor = root.FindChildTraverse("minimap_persp");
            SetCachedPanel("minimapObjectiveTimersAnchor", anchor);
        }
        return anchor || null;
    }








































    function PanelHasClassToken(panel, token) {
        if (!panel || !token) return false;
        if (panel.BHasClass && panel.BHasClass(token)) return true;
        var cls = GetPanelClassTokens(panel);
        for (var i = 0; i < cls.length; i++) {
            if (cls[i] === token) return true;
        }
        var kids = (panel.Children && panel.Children()) || [];
        for (var k = 0; k < kids.length; k++) {
            var child = kids[k];
            if (!child) continue;
            if (child.BHasClass && child.BHasClass(token)) return true;
            var ccls = GetPanelClassTokens(child);
            for (var j = 0; j < ccls.length; j++) {
                if (ccls[j] === token) return true;
            }
        }
        return false;
    }
    function GetHighestRejuvChargeTokenOnPanel(panel) {
        if (!panel) return 0;
        var max = 0;

        function scanNode(node) {
            if (!node) return;
            var tokens = GetPanelClassTokens(node);
            for (var i = 0; i < tokens.length; i++) {
                var token = tokens[i];
                if (!token || token.indexOf("RejuvCount_") !== 0) continue;
                var value = parseInt(token.slice("RejuvCount_".length), 10);
                if (isFinite(value) && value > max) max = value;
            }
            if (node.BHasClass) {
                for (var count = 1; count <= 4; count++) {
                    if (node.BHasClass("RejuvCount_" + String(count)) && count > max) {
                        max = count;
                    }
                }
            }
        }

        scanNode(panel);
        var kids = (panel.Children && panel.Children()) || [];
        for (var k = 0; k < kids.length; k++) {
            scanNode(kids[k]);
        }
        return max;
    }

















    function GetGameplayHudPanel(root) {
        if (!root || !root.FindChildTraverse) return root || null;
        return root.FindChildTraverse(PANEL_ID_GAMEPLAY_HUD) || root;
    }

    function IsCustomHudContextActive(root) {
        return true;
    }

    // ---- Adaptive Polling Degradation (Fix 9) ----

    /**
     * Detect the global idle state of the game.
     * Results are cached for IDLE_DETECTION_CACHE_MS to avoid per-tick overhead.
     * Returns { level: "active"|"idle"|"deep_idle"|"background", isInMatch, isHudVisible, lowFps }
     */
    function DetectGlobalIdleState(root) {
        var nowMs = PerfNowMs();
        if (State.lastIdleCheckMs && (nowMs - State.lastIdleCheckMs) < IDLE_DETECTION_CACHE_MS) {
            return State.lastIdleState || { level: "active", isInMatch: true, isHudVisible: true, lowFps: false };
        }
        State.lastIdleCheckMs = nowMs;

        var state = {
            isInMatch: false,
            isHudVisible: true,
            lowFps: false,
            level: "active"
        };

        // Check if in a match: hero panel exists
        if (root) {
            var heroPanel = root.FindChildTraverse ? root.FindChildTraverse("HeroPanel") : null;
            state.isInMatch = IsPanelValid(heroPanel);
        }

        // Check if HUD is hidden (spectator, replay)
        if (root && root.BHasClass) {
            state.isHudVisible = !root.BHasClass("HudHidden");
        }

        // Check for low FPS (requires perf tracking to be enabled)
        if (State.perfEnabled && State.perfLastFrameTimeMs) {
            state.lowFps = State.perfLastFrameTimeMs > LOW_FPS_THRESHOLD_MS;
        }

        // Determine degradation level
        if (!state.isInMatch) {
            state.level = "deep_idle";
        } else if (!state.isHudVisible || state.lowFps) {
            state.level = "idle";
        } else {
            state.level = "active";
        }

        State.lastIdleState = state;
        return state;
    }

    /**
     * Compute the dynamic loop interval based on idle state.
     * Returns the interval in seconds.
     */
    function GetDynamicLoopInterval(baseIntervalSec, idleState) {
        switch (idleState.level) {
            case "background":
                return Math.max(baseIntervalSec * LOOP_BACKGROUND_MULTIPLIER, 3.0);
            case "deep_idle":
                return Math.max(baseIntervalSec * LOOP_DEEP_IDLE_MULTIPLIER, 1.5);
            case "idle":
                return Math.max(baseIntervalSec * LOOP_IDLE_MULTIPLIER, 0.5);
            case "active":
            default:
                return baseIntervalSec;
        }
    }

    var BREAD_PRESET_NAME = "BreadRollius";
    var LEGACY_BREAD_PRESET_NAME = "Bread";

    function IsBreadPresetName(presetName) {
        var name = String(presetName || "");
        return name === BREAD_PRESET_NAME || name === LEGACY_BREAD_PRESET_NAME;
    }

    function IsBreadPresetMatchKeyIgnored(key) {
        return key === "ACTIVE_PRESET_NAME" ||
            key === "DRAG_ENABLED" ||
            key === "PREVIEWS_ENABLED" ||
            key === "SHOW_RANK" ||
            key === "SHOW_RANK_TOPBAR";
    }

    function ArePresetMatchValuesEqual(a, b) {
        if (typeof a === "number" && typeof b === "number") {
            return Math.abs(a - b) <= 0.0001;
        }
        return a === b;
    }

    function DoesConfigMatchBreadPreset(cfg) {
        if (!cfg || typeof QOL_PRESETS !== "object" || !QOL_PRESETS) return false;
        var bread = QOL_PRESETS[BREAD_PRESET_NAME] || QOL_PRESETS[LEGACY_BREAD_PRESET_NAME];
        if (!bread) return false;
        var defaults = _BDC();
        for (var key in defaults) {
            if (!defaults.hasOwnProperty(key) || IsBreadPresetMatchKeyIgnored(key)) continue;
            var expected = bread.hasOwnProperty(key) ? bread[key] : defaults[key];
            var actual = cfg.hasOwnProperty(key) ? cfg[key] : defaults[key];
            if (!ArePresetMatchValuesEqual(actual, expected)) return false;
        }
        return true;
    }

    function IsBreadPresetActive(cfg) {
        if (!cfg) return false;
        if (IsBreadPresetName(cfg.ACTIVE_PRESET_NAME)) {
            cfg.ACTIVE_PRESET_NAME = BREAD_PRESET_NAME;
            return true;
        }
        if (!DoesConfigMatchBreadPreset(cfg)) return false;
        cfg.ACTIVE_PRESET_NAME = BREAD_PRESET_NAME;
        return true;
    }

    function ApplyForcedFeatureDisables(cfg) {
        if (!cfg) return cfg;
        // Clone to avoid corrupting State.lastConfig (shared reference).
        var result = Object.assign({}, cfg);
        result.ENABLE_MIN_SOULS = 0;
        if (!IsBreadPresetActive(result)) result.ENABLE_UNSPENT_SOULS = 0;
        return result;
    }

    function LogHealthbarVisibilityDebug(root, healthContainer, cfg) {
        if (!HEALTHBAR_VIS_DEBUG) return;
        var nowMs = PerfNowMs();
        if (nowMs < (State.healthbarVisDebugNextMs || 0)) return;
        State.healthbarVisDebugNextMs = nowMs + HEALTHBAR_VIS_DEBUG_THROTTLE_MS;

        var hasContainer = !!(healthContainer && IsPanelValid(healthContainer));
        var gateVisible = IsHudVisibleForPlayerHealthbarRuntime(root, healthContainer);
        var styleOpacity = hasContainer ? ReadPanelOpacityMaybe(healthContainer) : NaN;
        var styleVisibility = "";
        var runtimeVisible = false;
        var geomW = 0;
        var geomH = 0;
        var posX = 0;
        var posY = 0;
        if (hasContainer) {
            try { styleVisibility = String((healthContainer.style && healthContainer.style.visibility) || ""); } catch (e0) { styleVisibility = ""; }
            try { runtimeVisible = !!healthContainer.visible; } catch (e1) { runtimeVisible = false; }
            try { geomW = Math.round(Number(healthContainer.actuallayoutwidth) || 0); } catch (e2) { geomW = 0; }
            try { geomH = Math.round(Number(healthContainer.actuallayoutheight) || 0); } catch (e3) { geomH = 0; }
            try { posX = Math.round(Number(healthContainer.actualxoffset) || 0); } catch (e4) { posX = 0; }
            try { posY = Math.round(Number(healthContainer.actualyoffset) || 0); } catch (e5) { posY = 0; }
        }

        var topBar = GetCachedPanel("topBarPanel");
        var abilities = GetCachedPanel("abilitiesContainer");
        var gameplayHud = GetCachedPanel("gameplayHud");
        var topBarSupp = topBar ? (IsPanelSuppressedMaybe(topBar) ? 1 : 0) : -1;
        var abilitiesSupp = abilities ? (IsPanelSuppressedMaybe(abilities) ? 1 : 0) : -1;
        var gameplaySupp = gameplayHud ? (IsPanelSuppressedMaybe(gameplayHud) ? 1 : 0) : -1;

        var healthbarType = _NHV(cfg && cfg.HEALTHBAR_TYPE);
        var playerOpacity = Number(cfg && cfg.PLAYER_HEALTHBAR_OPACITY);
        if (!isFinite(playerOpacity)) playerOpacity = -1;
        var playerScale = Number(cfg && cfg.PLAYER_HEALTHBAR_SCALE);
        if (!isFinite(playerScale)) playerScale = -1;
        var playerX = Number(cfg && cfg.PLAYER_HEALTHBAR_X_OFFSET);
        if (!isFinite(playerX)) playerX = -99999;
        var playerY = Number(cfg && cfg.PLAYER_HEALTHBAR_Y_OFFSET);
        if (!isFinite(playerY)) playerY = -99999;

        var rootInHideout = (root && root.BHasClass && (root.BHasClass("InHideout") || root.BHasClass("inHideoutIntro"))) ? 1 : 0;
        var rootShowEscape = (root && root.BHasClass && root.BHasClass("ShowEscapeMenu")) ? 1 : 0;
        var rootTakeover = (root && root.BHasClass && root.BHasClass("HudTakeoverEnabled")) ? 1 : 0;

        var sig = [
            hasContainer ? 1 : 0,
            gateVisible ? 1 : 0,
            rootInHideout,
            rootShowEscape,
            rootTakeover,
            topBarSupp,
            abilitiesSupp,
            gameplaySupp,
            healthbarType,
            playerOpacity.toFixed(2),
            playerScale,
            playerX,
            playerY,
            isFinite(styleOpacity) ? styleOpacity.toFixed(2) : "nan",
            styleVisibility,
            runtimeVisible ? 1 : 0,
            geomW + "x" + geomH + "@" + posX + "," + posY
        ].join("|");
        if (sig === State.healthbarVisDebugLastSig) return;
        State.healthbarVisDebugLastSig = sig;

        $.Msg(
            "[QOLLock][HealthbarVis] " +
            "has=" + (hasContainer ? 1 : 0) +
            " gate=" + (gateVisible ? 1 : 0) +
            " rootHideout=" + rootInHideout +
            " rootEsc=" + rootShowEscape +
            " rootTakeover=" + rootTakeover +
            " supp[top,abil,gp]=" + topBarSupp + "," + abilitiesSupp + "," + gameplaySupp +
            " cfg[type,op,scale,x,y]=" + healthbarType + "," + playerOpacity.toFixed(2) + "," + playerScale + "," + playerX + "," + playerY +
            " panel[op,vis,rt,geo]=" + (isFinite(styleOpacity) ? styleOpacity.toFixed(2) : "nan") + "," + styleVisibility + "," + (runtimeVisible ? 1 : 0) + "," + geomW + "x" + geomH + "@" + posX + "," + posY
        );
    }

    function GetFirstPanelTextByClass(panel, className) {
        if (!panel || !panel.FindChildrenWithClassTraverse) return "";
        var items = panel.FindChildrenWithClassTraverse(className) || [];
        for (var i = 0; i < items.length; i++) {
            var p = items[i];
            if (p && p.text && p.text.length > 0) return p.text;
        }
        return "";
    }

    function GetFirstPanelTextById(panel, idName) {
        if (!panel || !panel.FindChildTraverse || !idName) return "";
        var p = panel.FindChildTraverse(idName);
        if (!p || typeof p.text !== "string") return "";
        return p.text;
    }

    function NormalizeCooldownNumberText(text) {
        if (!text || typeof text !== "string") return "";
        var trimmed = text.trim();
        if (trimmed.length === 0) return "";
        var exact = /^(\d+(?:\.\d+)?)(?:s)?$/i.exec(trimmed);
        if (exact && exact[1]) return exact[1];
        var contains = /(\d+(?:\.\d+)?)/.exec(trimmed);
        if (contains && contains[1]) return contains[1];
        return "";
    }

    function IsItemMirrorCooldownProbeExcludedPanel(panel) {
        if (!panel) return false;
        var panelId = "";
        try { panelId = String(panel.id || ""); } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        if (
            panelId === "UpgradeLevelContainer" ||
            panelId === "UpgradeLevel" ||
            panelId === "TierContainer" ||
            panelId === "mod_tier_label" ||
            panelId === "ItemHidden" ||
            panelId === "embedded_active_tag" ||
            panelId === "ActiveTagContainer"
        ) {
            return true;
        }
        if (panel.BHasClass) {
            try {
                if (
                    panel.BHasClass("tier_bg") ||
                    panel.BHasClass("mod_icon_background_container")
                ) {
                    return true;
                }
            } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        }
        return false;
    }

    function FindNumericLabelTextInTree(panel) {
        if (!panel || !panel.Children) return "";
        var queue = [panel];
        var best = "";
        while (queue.length > 0) {
            var current = queue.shift();
            if (!current) continue;

            if (IsItemMirrorCooldownProbeExcludedPanel(current)) continue;

            if (typeof current.text === "string") {
                var t = current.text.trim();
                var norm = NormalizeCooldownNumberText(t);
                if (norm && norm.length > 0) {
                    if (!best || norm.length <= best.length) {
                        best = norm;
                        if (t.length <= 2) return best;
                    }
                }
            }

            var kids = current.Children ? current.Children() : [];
            for (var i = 0; i < kids.length; i++) queue.push(kids[i]);
        }
        return best;
    }

    function ProbeCooldownTextFromSourceIcon(sourceIcon) {
        var classCandidates = ["Countdown", "cooldown_text", "CooldownText", "CooldownLabel"];
        var idCandidates = ["Countdown", "cooldown_text", "CooldownText", "CooldownLabel"];
        var byClass = {};
        var byId = {};
        var chosen = "";
        var chosenSource = "";

        if (!sourceIcon) {
            return { chosen: "", chosenSource: "", byClass: byClass, byId: byId, numeric: "" };
        }

        for (var i = 0; i < classCandidates.length; i++) {
            var cls = classCandidates[i];
            var rawByClass = GetFirstPanelTextByClass(sourceIcon, cls);
            var normByClass = NormalizeCooldownNumberText(rawByClass);
            byClass[cls] = normByClass || "";
            if (!chosen && normByClass) {
                chosen = normByClass;
                chosenSource = "class:" + cls;
            }
        }

        for (var j = 0; j < idCandidates.length; j++) {
            var id = idCandidates[j];
            var rawById = GetFirstPanelTextById(sourceIcon, id);
            var normById = NormalizeCooldownNumberText(rawById);
            byId[id] = normById || "";
            if (!chosen && normById) {
                chosen = normById;
                chosenSource = "id:" + id;
            }
        }

        var numeric = FindNumericLabelTextInTree(sourceIcon);
        if (!chosen && numeric) {
            chosen = numeric;
            chosenSource = "numeric";
        }

        return {
            chosen: chosen || "",
            chosenSource: chosenSource || "",
            byClass: byClass,
            byId: byId,
            numeric: numeric || ""
        };
    }

    function FindZipBoostSource(root) {
        var byId = root.FindChildTraverse("citadel_ability_zipline_boost_");
        if (byId) return byId;

        var candidates = root.FindChildrenWithClassTraverse("buttonContainer") || [];
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            if (c && c.BHasClass && c.BHasClass("citadel_ability_zipline_boost")) return c;
        }
        return null;
    }

    function CreateKeyboardOverlayKey(parent, spec) {
        if (!parent || !spec) return null;
        if (spec.emptyClass) {
            var empty = $.CreatePanel("Panel", parent, "");
            empty.AddClass("Key");
            empty.AddClass(spec.emptyClass);
            return empty;
        }

        var binding = $.CreatePanel("CitadelBinding", parent, "", {
            action: spec.action,
            glyphstyle: spec.glyphstyle,
            solid: "false"
        });
        binding.AddClass("Key");
        if (spec.keyClass) binding.AddClass(spec.keyClass);
        return binding;
    }

    function CreateKeyboardOverlayRow(layout, specs) {
        var row = $.CreatePanel("Panel", layout, "");
        row.AddClass("KeyboardRow");
        for (var i = 0; i < specs.length; i++) {
            CreateKeyboardOverlayKey(row, specs[i]);
        }
        return row;
    }

    function BuildKeyboardOverlayLayouts(allBindingsBox) {
        var baseLayout = $.CreatePanel("Panel", allBindingsBox, "");
        baseLayout.AddClass("KeyboardLayout");
        baseLayout.AddClass("KeyboardLayoutBase");
        CreateKeyboardOverlayRow(baseLayout, [
            { emptyClass: "EmptyKeyWide" },
            { action: "AbilityMelee", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "MoveForward", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Attack", glyphstyle: "dark", keyClass: "MouseKey" },
            { action: "ADS", glyphstyle: "dark", keyClass: "MouseKey" }
        ]);
        CreateKeyboardOverlayRow(baseLayout, [
            { action: "Roll", glyphstyle: "light", keyClass: "ShiftKey" },
            { action: "MoveLeft", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "MoveBackwards", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "MoveRight", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "HeldItem", glyphstyle: "light", keyClass: "ASDFKey" }
        ]);
        CreateKeyboardOverlayRow(baseLayout, [
            { action: "Crouch", glyphstyle: "light", keyClass: "CtrlKey" },
            { action: "Mantle", glyphstyle: "light", keyClass: "SpaceKey" }
        ]);

        var fullLayout = $.CreatePanel("Panel", allBindingsBox, "");
        fullLayout.AddClass("KeyboardLayout");
        fullLayout.AddClass("KeyboardLayoutFull");
        CreateKeyboardOverlayRow(fullLayout, [
            { emptyClass: "EmptyKey" },
            { action: "Ability1", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Ability2", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Ability3", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Ability4", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Attack", glyphstyle: "dark", keyClass: "MouseKey" },
            { action: "ADS", glyphstyle: "dark", keyClass: "MouseKey" }
        ]);
        CreateKeyboardOverlayRow(fullLayout, [
            { action: "Scoreboard", glyphstyle: "light", keyClass: "TabKey" },
            { action: "AbilityMelee", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "MoveForward", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Cosmetic1", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Reload", glyphstyle: "light", keyClass: "QWERTYKey" }
        ]);
        CreateKeyboardOverlayRow(fullLayout, [
            { emptyClass: "EmptyKeyWide" },
            { action: "MoveLeft", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "MoveBackwards", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "MoveRight", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "HeldItem", glyphstyle: "light", keyClass: "ASDFKey" }
        ]);
        CreateKeyboardOverlayRow(fullLayout, [
            { action: "Roll", glyphstyle: "light", keyClass: "ShiftKey" },
            { action: "Item1", glyphstyle: "light", keyClass: "ZXCVKey" },
            { action: "Item2", glyphstyle: "light", keyClass: "ZXCVKey" },
            { action: "Item3", glyphstyle: "light", keyClass: "ZXCVKey" },
            { action: "Item4", glyphstyle: "light", keyClass: "ZXCVKey" }
        ]);
        CreateKeyboardOverlayRow(fullLayout, [
            { action: "Crouch", glyphstyle: "light", keyClass: "CtrlKey" },
            { action: "ExtraInfo", glyphstyle: "light", keyClass: "AltKey" },
            { action: "Mantle", glyphstyle: "light", keyClass: "SpaceKey" }
        ]);
    }

    function ResetKeyboardOverlayCaches() {
        State.keyboardBoxCaches = [];
    }

    function IsPanelListValid(list) {
        return QOL_UTILS_LOADED ? QOL_UTILS.IsPanelListValid(list) : (function() {
            if (!list || list.length === 0) return false;
            for (var i = 0; i < list.length; i++) {
                if (!IsPanelValid(list[i])) return false;
            }
            return true;
        })();
    }

    var NormalizeOpacityNumber = QOL_UTILS_LOADED ? QOL_UTILS.NormalizeOpacityNumber : function(value, fallback) {
        var n = Number(value);
        if (!isFinite(n)) n = Number(fallback);
        if (!isFinite(n)) n = 1.0;
        if (n < 0) n = 0;
        if (n > 1) n = 1;
        return n;
    };

    var SetPanelOpacitySafe = QOL_UTILS_LOADED ? QOL_UTILS.SetPanelOpacitySafe : function(panel, value, fallback) {
        if (!panel || !panel.style) return "";
        var text = NormalizeOpacityNumber(value, fallback).toFixed(2);
        try {
            if (panel.style.opacity !== text) panel.style.opacity = text;
        } catch (e0) {
            try { panel.style.opacity = "1.00"; } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        }
        return text;
    };

    var NormalizeHudOffsetNumber = QOL_UTILS_LOADED ? QOL_UTILS.NormalizeHudOffsetNumber : function(value, fallback) {
        var n = Math.round(Number(value));
        if (!isFinite(n)) n = Math.round(Number(fallback) || 0);
        if (!isFinite(n)) n = 0;
        return n;
    };

    var FormatHudPx = QOL_UTILS_LOADED ? QOL_UTILS.FormatHudPx : function(value, fallback) {
        return String(NormalizeHudOffsetNumber(value, fallback)) + "px";
    };

    var NormalizeHudScaleNumber = QOL_UTILS_LOADED ? QOL_UTILS.NormalizeHudScaleNumber : function(value, fallback) {
        var n = Number(value);
        if (!isFinite(n)) n = Number(fallback);
        if (!isFinite(n)) n = 1.0;
        if (n < 0.5) n = 0.5;
        if (n > 1.5) n = 1.5;
        return n;
    };

    function NormalizeEnhancedQuickbuyCount(value) {
        var n = Math.round(Number(value));
        if (!isFinite(n)) n = 3;
        if (n < 1) n = 1;
        if (n > 5) n = 5;
        return n;
    }

    function NormalizeDamageImpactScaleNumber(value, fallback) {
        var n = Number(value);
        if (!isFinite(n)) n = Number(fallback);
        if (!isFinite(n)) n = 1.0;
        if (n < 0.5) n = 0.5;
        if (n > 2.0) n = 2.0;
        return n;
    }

    function HasNonDefaultDamageImpactRuntimeConfig(cfg) {
        if (!cfg) return false;
        return (
            Number(cfg.ENABLE_DAMAGE_IMPACT) !== 1 ||
            NormalizeDamageImpactScaleNumber(cfg.DAMAGE_IMPACT_SCALE, 1.0) !== 1.0 ||
            NormalizeOpacityNumber(cfg.DAMAGE_IMPACT_OPACITY, 1.0) !== 1.0 ||
            NormalizeHudOffsetNumber(cfg.DAMAGE_IMPACT_X_OFFSET, 0) !== 0 ||
            NormalizeHudOffsetNumber(cfg.DAMAGE_IMPACT_Y_OFFSET, 0) !== 0
        );
    }

    function HasNonDefaultTopBarRuntimeConfig(cfg) {
        if (!cfg) return false;
        return (
            Number(cfg.HUD_TOP_BAR_ENABLED) !== 1 ||
            NormalizeOpacityNumber(cfg.TOP_BAR_OPACITY, 1.0) !== 1.0 ||
            NormalizeHudScaleNumber(cfg.TOP_BAR_SCALE, 1.0) !== 1.0 ||
            NormalizeHudOffsetNumber(cfg.TOP_BAR_X_OFFSET, 0) !== 0 ||
            NormalizeHudOffsetNumber(cfg.TOP_BAR_Y_OFFSET, 0) !== 0
        );
    }

    function IsHudVisibleForTopBarRuntime(root, topBar) {
        if (!root) return true;

        function hasAnyClassInHierarchySafe(panel, classNames) {
            if (!panel || !classNames || classNames.length <= 0) return false;
            for (var i = 0; i < classNames.length; i++) {
                var cls = classNames[i];
                if (!cls) continue;
                try {
                    if (hasClassInHierarchy(panel, cls)) return true;
                } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
            }
            return false;
        }

        // WHY: connectedToHideout must be here so inline style.opacity is never
        // set anywhere in the hideout (hero sandbox has connectedToHideout but
        // NOT InHideout/inHideoutIntro). Inline opacity overrides CSS rules.
        var hiddenContextClasses = [
            "connectedToHideout",
            "InHideout",
            "inHideout",
            "inHideoutIntro",
            "HideoutIntro"
        ];
        var hiddenUiClasses = [
            "ShowEscapeMenu",
            "HudTakeoverEnabled"
        ];

        var hud = GetCachedPanel("hudPanel");
        if (!hud && root.FindChildTraverse) {
            hud = root.FindChildTraverse(PANEL_ID_HUD);
            SetCachedPanel("hudPanel", hud);
        }

        if (hasAnyClassInHierarchySafe(root, hiddenUiClasses)) return false;
        if (hasAnyClassInHierarchySafe(hud, hiddenUiClasses)) return false;
        // IMPORTANT: connectedToHideout is checked first so the top bar never
        // sets inline style.opacity anywhere in the hideout (inline opacity
        // overrides CSS opacity rules on .connectedToHideout selectors).
        if (hasAnyClassInHierarchySafe(root, hiddenContextClasses)) return false;
        if (hasAnyClassInHierarchySafe(hud, hiddenContextClasses)) return false;
        if (hasAnyClassInHierarchySafe(topBar, hiddenContextClasses)) return false;

        var gameplayHud = GetCachedPanel("gameplayHud");
        if (!gameplayHud && root.FindChildTraverse) {
            gameplayHud = root.FindChildTraverse(PANEL_ID_GAMEPLAY_HUD);
            SetCachedPanel("gameplayHud", gameplayHud);
        }

        var gameplayHudAlive = GetCachedPanel("gameplayHudAlive");
        if (!gameplayHudAlive && root.FindChildTraverse) {
            gameplayHudAlive = root.FindChildTraverse("gameplay_hud_alive");
            SetCachedPanel("gameplayHudAlive", gameplayHudAlive);
        }

        if (gameplayHud && !IsPanelEffectivelyVisibleMaybe(gameplayHud, root)) return false;
        if (gameplayHudAlive && !IsPanelEffectivelyVisibleMaybe(gameplayHudAlive, root)) return false;

        return true;
    }

    function HasNonDefaultBottomBarRuntimeConfig(cfg) {
        if (!cfg) return false;
        return (
            Number(cfg.HUD_BOTTOM_BAR_ENABLED) !== 1 ||
            NormalizeOpacityNumber(cfg.BOTTOM_BAR_OPACITY, 1.0) !== 1.0 ||
            NormalizeHudScaleNumber(cfg.BOTTOM_BAR_SCALE, 1.0) !== 1.0 ||
            NormalizeHudOffsetNumber(cfg.BOTTOM_BAR_X_OFFSET, 0) !== 0 ||
            NormalizeHudOffsetNumber(cfg.BOTTOM_BAR_Y_OFFSET, 0) !== 0 ||
            ReadBottomBarWashColorIndex(cfg) !== 0
        );
    }

    function HasNonDefaultStaminaChargeColorConfig(cfg) {
        if (!cfg) return false;
        return ReadStaminaChargeColorIndex(cfg) !== 0;
    }

    function NormalizeStaminaChargeAngle(value) {
        var angle = Math.round(Number(value));
        if (!isFinite(angle)) angle = 45;
        if (angle < 0) angle = 0;
        if (angle > 360) angle = 360;
        return angle;
    }

    function NormalizeAmmoClipAngle(value) {
        var angle = Math.round(Number(value));
        if (!isFinite(angle)) angle = 0;
        if (angle < 0) angle = 0;
        if (angle > 360) angle = 360;
        return angle;
    }

    function HasNonDefaultStaminaChargeRuntimeConfig(cfg) {
        if (!cfg) return false;
        return NormalizeStaminaChargeAngle(cfg.STAMINA_CHARGE_ANGLE) !== 45 ||
            HasNonDefaultStaminaChargeColorConfig(cfg);
    }

    function HasNonDefaultItemsRuntimeConfig(cfg) {
        if (!cfg) return false;
        return (
            Number(cfg.HUD_ITEMS_ENABLED) !== 1 ||
            NormalizeOpacityNumber(cfg.ITEMS_OPACITY, 1.0) !== 1.0 ||
            NormalizeHudOffsetNumber(cfg.ITEMS_X_OFFSET, 0) !== 0 ||
            NormalizeHudOffsetNumber(cfg.ITEMS_Y_OFFSET, 0) !== 0 ||
            NormalizePaletteColorIndex(cfg.ITEMS_WASH_COLOR) !== 0
        );
    }

    function HasNonDefaultSoulsRuntimeConfig(cfg) {
        if (!cfg) return false;
        return (
            Number(cfg.HUD_SOULS_ENABLED) !== 1 ||
            NormalizeOpacityNumber(cfg.SOULS_OPACITY, 1.0) !== 1.0 ||
            NormalizeHudOffsetNumber(cfg.SOULS_X_OFFSET, 0) !== 0 ||
            NormalizeHudOffsetNumber(cfg.SOULS_Y_OFFSET, 0) !== 0
        );
    }

    function EnsurePanelClassCache(cacheObj, panel) {
        if (!cacheObj) return;
        if (cacheObj.panel !== panel) {
            cacheObj.panel = panel;
            cacheObj.values = {};
        }
    }

    function SetPanelClassCached(panel, cacheObj, className, enabled) {
        if (!panel || !cacheObj || !className) return false;
        EnsurePanelClassCache(cacheObj, panel);
        var value = !!enabled;
        if (cacheObj.values[className] === value) return false;
        panel.SetHasClass(className, value);
        cacheObj.values[className] = value;
        return true;
    }

    function SetPanelClassIfChanged(panel, className, enabled) {
        if (!panel || !className || !panel.SetHasClass) return;
        var value = !!enabled;
        if (panel.BHasClass && panel.BHasClass(className) === value) return;
        panel.SetHasClass(className, value);
    }


    function ResolveUnitTargetStyleTexts(cfg) {
        var unitTargetSize = (cfg && cfg.UNIT_TARGET_SIZE !== undefined && cfg.UNIT_TARGET_SIZE !== null)
            ? Math.round(Number(cfg.UNIT_TARGET_SIZE))
            : 150;
        var unitTargetOpacity = (cfg && cfg.UNIT_TARGET_OPACITY !== undefined && cfg.UNIT_TARGET_OPACITY !== null)
            ? parseFloat(cfg.UNIT_TARGET_OPACITY)
            : 1.0;
        var unitTargetHintSize = (cfg && cfg.UNIT_TARGET_HINT_SIZE !== undefined && cfg.UNIT_TARGET_HINT_SIZE !== null)
            ? Math.round(Number(cfg.UNIT_TARGET_HINT_SIZE))
            : 100;

        if (!isFinite(unitTargetSize)) unitTargetSize = 150;
        if (!isFinite(unitTargetOpacity)) unitTargetOpacity = 1.0;
        if (!isFinite(unitTargetHintSize)) unitTargetHintSize = 100;
        if (unitTargetSize < 50) unitTargetSize = 50;
        if (unitTargetSize > 300) unitTargetSize = 300;
        if (unitTargetOpacity < 0) unitTargetOpacity = 0;
        if (unitTargetOpacity > 1) unitTargetOpacity = 1;
        if (unitTargetHintSize < 50) unitTargetHintSize = 50;
        if (unitTargetHintSize > 200) unitTargetHintSize = 200;

        return {
            scaleText: (unitTargetSize / 100).toFixed(3),
            opacityText: unitTargetOpacity.toFixed(2),
            hintScaleText: (unitTargetHintSize / 100).toFixed(3)
        };
    }

    function ApplyTargetShapeStyles(root, scaleText, opacityText, nowMs, redDiamondEnabledHint, hintScaleText) {
        var redDiamondActive = !!redDiamondEnabledHint;
        if (!redDiamondActive && root && root.BHasClass) {
            try {
                redDiamondActive = !!root.BHasClass("red_diamond_active");
            } catch (e0) {
                redDiamondActive = false;
            }
        }

        var defaultStyle = GetUnitTargetDefaultStyleTexts();
        var isDefaultUnitTargetStyle =
            !redDiamondActive &&
            scaleText === defaultStyle.scaleText &&
            opacityText === defaultStyle.opacityText &&
            (hintScaleText || "1.000") === defaultStyle.hintScaleText;
        var needsCleanupPass = isDefaultUnitTargetStyle && !!State.targetShapeHadNonDefaultRuntime;

        if (isDefaultUnitTargetStyle && !needsCleanupPass) {
            State.targetShapesCache = [];
            State.hintContainerCache = [];
            State.targetShapeStyleSig = "";
            State.nextTargetShapeRefreshMs = 0;
            return;
        }

        var styleSig = scaleText + "|" + opacityText + "|" + (redDiamondActive ? "1" : "0") + "|" + (hintScaleText || "1.000");
        var styleChanged = (styleSig !== State.targetShapeStyleSig);
        var cacheValid = IsPanelListValid(State.targetShapesCache);
        var shouldRefreshList = needsCleanupPass || styleChanged || !cacheValid || nowMs >= (State.nextTargetShapeRefreshMs || 0);
        if (styleSig === State.targetShapeStyleSig && !shouldRefreshList) return;

        if (shouldRefreshList) {
            State.targetShapesCache = root.FindChildrenWithClassTraverse("target_shape") || [];
            State.hintContainerCache = root.FindChildrenWithClassTraverse("qol_hint_target") || [];
            var _tsDefaultStyle = GetUnitTargetDefaultStyleTexts();
            var _tsRefreshMs = (
                redDiamondActive ||
                styleChanged ||
                scaleText !== _tsDefaultStyle.scaleText ||
                opacityText !== _tsDefaultStyle.opacityText ||
                (hintScaleText || "1.000") !== _tsDefaultStyle.hintScaleText
            ) ? 60 : 1000;
            State.nextTargetShapeRefreshMs = nowMs + _tsRefreshMs;
        }

        var targetShapes = State.targetShapesCache || [];
        for (var ts = 0; ts < targetShapes.length; ts++) {
            var shape = targetShapes[ts];
            if (!shape) continue;
            if (shape.style.preTransformScale2d !== scaleText) {
                shape.style.preTransformScale2d = scaleText;
            }
            SetPanelOpacitySafe(shape, opacityText, 1.0);
        }
        var hintContainers = State.hintContainerCache || [];
        for (var hc = 0; hc < hintContainers.length; hc++) {
            var hint = hintContainers[hc];
            if (!hint) continue;
            if (hint.style.preTransformScale2d !== (hintScaleText || "1.000")) {
                hint.style.preTransformScale2d = (hintScaleText || "1.000");
            }
        }
        State.targetShapeStyleSig = styleSig;
        if (!isDefaultUnitTargetStyle) {
            State.targetShapeHadNonDefaultRuntime = true;
            return;
        }

        if (needsCleanupPass) {
            State.targetShapeHadNonDefaultRuntime = false;
            State.targetShapesCache = [];
            State.hintContainerCache = [];
            State.targetShapeStyleSig = "";
            State.nextTargetShapeRefreshMs = 0;
        }
    }


    var UnitTargetDefaultStyleTexts = null;

    function GetUnitTargetDefaultStyleTexts() {
        if (UnitTargetDefaultStyleTexts) return UnitTargetDefaultStyleTexts;
        var result = ResolveUnitTargetStyleTexts(_BDC());
        // Clone to avoid aliasing when ResolveUnitTargetStyleTexts reuses internal scratch objects.
        UnitTargetDefaultStyleTexts = { scaleText: result.scaleText, opacityText: result.opacityText, hintScaleText: result.hintScaleText };
        return UnitTargetDefaultStyleTexts;
    }

    function IsUnitTargetStyleCustomized(cfg) {
        var style = ResolveUnitTargetStyleTexts(cfg);
        var defaultStyle = GetUnitTargetDefaultStyleTexts();
        return style.scaleText !== defaultStyle.scaleText || style.opacityText !== defaultStyle.opacityText || style.hintScaleText !== defaultStyle.hintScaleText;
    }



    function IsLikelyAccountId(value) {
        if (value === undefined || value === null) return false;
        var text = String(value).trim();
        if (!text || text.length === 0) return false;
        if (!/^\d+$/.test(text)) return false;
        if (text === "0") return false;
        // Steam32/account_id is typically up to 10 digits; allow a small buffer.
        if (text.length < 5 || text.length > 12) return false;
        return true;
    }

    function ReadAccountIdFromPanel(panel) {
        if (!panel) return "";
        var candidates = [];
        try { candidates.push(panel.accountid); } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        try { candidates.push(panel.account_id); } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        try { candidates.push(panel.accountID); } catch(e2) { QOL_WARN("core", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
        try {
            if (panel.GetAttributeString) {
                candidates.push(panel.GetAttributeString("accountid", ""));
                candidates.push(panel.GetAttributeString("account_id", ""));
                candidates.push(panel.GetAttributeString("accountID", ""));
            }
        } catch(e3) { QOL_WARN("core", "op failed: " + (e3 && e3.message ? e3.message : String(e3 || ""))); }

        for (var i = 0; i < candidates.length; i++) {
            if (IsLikelyAccountId(candidates[i])) {
                return String(candidates[i]).trim();
            }
        }
        return "";
    }

    function GetPanelDebugPath(panel, maxDepth) {
        var depthLimit = (maxDepth === undefined || maxDepth === null) ? 6 : maxDepth;
        var parts = [];
        var cur = panel;
        var depth = 0;
        while (cur && depth < depthLimit) {
            var part = "";
            try {
                if (cur.id && cur.id.length > 0) {
                    part = "#" + cur.id;
                }
            } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
            if (!part) {
                try {
                    if (cur.paneltype && cur.paneltype.length > 0) {
                        part = cur.paneltype;
                    }
                } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
            }
            if (!part) part = "Panel";
            parts.push(part);
            try { cur = cur.GetParent ? cur.GetParent() : null; } catch (e2) { cur = null; }
            depth++;
        }
        parts.reverse();
        return parts.join(">");
    }

    function IsLikelyLocalAccountCarrier(panel) {
        var cur = panel;
        var depth = 0;
        while (cur && depth < 10) {
            var idText = "";
            try { idText = cur.id ? String(cur.id).toLowerCase() : ""; } catch (e0) { idText = ""; }
            if (idText.length > 0) {
                if (idText.indexOf("localplayer") !== -1 || idText === "avatarimage") return true;
                if (idText.indexOf("local") !== -1) return true;
                if (idText.indexOf("profile") !== -1) return true;
                if (idText.indexOf("party") !== -1) return true;
                if (idText.indexOf("username") !== -1 || idText === "pusername" || idText === "username") return true;
                if (idText.indexOf("scoreboard") !== -1 || idText.indexOf("teammate") !== -1 || idText.indexOf("enemy") !== -1) return false;
            }
            cur = cur.GetParent ? cur.GetParent() : null;
            depth++;
        }
        return false;
    }

    function TryReadAccountIdFromKnownPartyPath(root) {
        if (!root) return "";
        var partyContainer = root.FindChildTraverse("CitadelPartyContainer");
        if (!partyContainer) return "";
        var party = partyContainer.FindChildTraverse("CitadelParty");
        if (!party) return "";
        var localPlayer = party.FindChildTraverse("LocalPlayer");
        if (!localPlayer) return "";
        var avatar = localPlayer.FindChildTraverse("AvatarImage");
        if (!avatar) return "";
        return ReadAccountIdFromPanel(avatar);
    }
    // ── Generic Loader Overlay Helpers ──
    // Replaces 3 near-identical copies of step-row creation, state management,
    // and overlay rendering. Each existing overlay function delegates to these.

    function _GetLoaderStepIndex(stepKey, steps) {
        if (!stepKey) return -1;
        for (var i = 0; i < steps.length; i++) {
            if (steps[i].key === stepKey) return i;
        }
        return -1;
    }

    function _ResetLoaderStepStates(stateObj, steps) {
        if (!stateObj || typeof stateObj !== "object") return;
        for (var k in stateObj) {
            if (stateObj.hasOwnProperty(k)) delete stateObj[k];
        }
        for (var i = 0; i < steps.length; i++) {
            stateObj[steps[i].key] = "pending";
        }
    }

    function _ResetLoaderSession(statePrefix, cachedOverlayKey, steps, hideOverlay) {
        State[statePrefix + "SessionToken"] = "";
        State[statePrefix + "SessionActive"] = false;
        State[statePrefix + "SessionCompleted"] = false;
        State[statePrefix + "CurrentStep"] = "";
        State[statePrefix + "Detail"] = "";
        State[statePrefix + "Result"] = "";
        State[statePrefix + "ShowUntilMs"] = 0;
        State[statePrefix + "NextReassertMs"] = 0;
        State[statePrefix + "LastRenderSig"] = "";
        _ResetLoaderStepStates(State[statePrefix + "StepStates"], steps);
        if (hideOverlay) {
            var overlay = GetCachedPanel(cachedOverlayKey);
            if (overlay) {
                try { overlay.style.visibility = "collapse"; } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
            }
        }
    }

    function _BeginLoaderSession(statePrefix, steps, requestToken, nowMs, initialDetail, enabledCheck) {
        if (enabledCheck && !enabledCheck()) return;
        var token = requestToken ? String(requestToken) : "";
        if (!token) return;
        if (
            State[statePrefix + "SessionToken"] === token &&
            (State[statePrefix + "SessionActive"] || State[statePrefix + "SessionCompleted"])
        ) {
            return;
        }
        _ResetLoaderStepStates(State[statePrefix + "StepStates"], steps);
        State[statePrefix + "SessionToken"] = token;
        State[statePrefix + "SessionActive"] = true;
        State[statePrefix + "SessionCompleted"] = false;
        State[statePrefix + "CurrentStep"] = "start";
        State[statePrefix + "Detail"] = initialDetail || "";
        State[statePrefix + "Result"] = "";
        State[statePrefix + "ShowUntilMs"] = 0;
        State[statePrefix + "LastRenderSig"] = "";
        if (State[statePrefix + "StepStates"] && typeof State[statePrefix + "StepStates"] === "object") {
            State[statePrefix + "StepStates"].start = "active";
        }
    }

    function _SetLoaderStepState(statePrefix, steps, stepKey, status, detail, enabledCheck) {
        if (enabledCheck && !enabledCheck()) return;
        var idx = _GetLoaderStepIndex(stepKey, steps);
        if (idx < 0) return;
        var stepStates = State[statePrefix + "StepStates"];
        if (!stepStates || typeof stepStates !== "object") {
            State[statePrefix + "StepStates"] = {};
            stepStates = State[statePrefix + "StepStates"];
            for (var i = 0; i < steps.length; i++) {
                stepStates[steps[i].key] = "pending";
            }
        }
        var st = status ? String(status) : "pending";
        stepStates[stepKey] = st;
        if (st === "active") {
            State[statePrefix + "CurrentStep"] = stepKey;
            if (!State[statePrefix + "SessionCompleted"]) {
                State[statePrefix + "SessionActive"] = true;
            }
        }
        if (detail !== undefined && detail !== null && String(detail).length > 0) {
            State[statePrefix + "Detail"] = String(detail);
        }
    }

    function _GetLoaderStepState(statePrefix, stepKey) {
        if (!stepKey) return "pending";
        var stepStates = State[statePrefix + "StepStates"];
        if (!stepStates || typeof stepStates !== "object") return "pending";
        if (!stepStates.hasOwnProperty(stepKey)) return "pending";
        return String(stepStates[stepKey] || "pending");
    }

    function _BuildLoaderStepStateSignature(statePrefix, steps) {
        var parts = [];
        for (var i = 0; i < steps.length; i++) {
            parts.push(steps[i].key + ":" + _GetLoaderStepState(statePrefix, steps[i].key));
        }
        return parts.join("|");
    }

    function _EnsureLoaderStepRows(stepsWrap, steps, stepRowIdPrefix, iconSuffix, labelSuffix, cachedRowsKey) {
        if (!stepsWrap) return null;
        var rows = State.cachedPanels[cachedRowsKey];
        if (!rows || typeof rows !== "object") rows = {};
        for (var i = 0; i < steps.length; i++) {
            var step = steps[i];
            var key = step.key;
            var existing = rows.hasOwnProperty(key) ? rows[key] : null;
            var row = existing && IsPanelValid(existing.row) ? existing.row : null;
            var icon = existing && IsPanelValid(existing.icon) ? existing.icon : null;
            var label = existing && IsPanelValid(existing.label) ? existing.label : null;
            var rowId = stepRowIdPrefix + key;
            if (!row) row = stepsWrap.FindChildTraverse ? (stepsWrap.FindChildTraverse(rowId) || null) : null;
            if (!row) row = $.CreatePanel("Panel", stepsWrap, rowId, { hittest: "false", hittestchildren: "false" });
            if (!row) continue;
            row.hittest = false;
            row.hittestchildren = false;
            if (row.AddClass) row.AddClass("QOLSettingsLoaderStepRow");
            ApplyLoaderStepRowTheme(row);

            var iconId = rowId + iconSuffix;
            if (!icon) icon = row.FindChildTraverse ? (row.FindChildTraverse(iconId) || null) : null;
            if (!icon) icon = $.CreatePanel("Image", row, iconId, { hittest: "false", hittestchildren: "false" });
            if (icon) {
                icon.hittest = false;
                icon.hittestchildren = false;
                if (icon.AddClass) icon.AddClass("QOLSettingsLoaderStepIcon");
                ApplyLoaderStepIconTheme(icon);
            }

            var labelId = rowId + labelSuffix;
            if (!label) label = row.FindChildTraverse ? (row.FindChildTraverse(labelId) || null) : null;
            if (!label) label = $.CreatePanel("Label", row, labelId);
            if (label) {
                label.hittest = false;
                label.hittestchildren = false;
                if (label.AddClass) label.AddClass("QOLSettingsLoaderStepLabel");
                ApplyLoaderStepLabelTheme(label);
            }
            var reuseRow = !!(existing && row && existing.row === row);
            var reuseIcon = !!(existing && icon && existing.icon === icon);
            var reuseLabel = !!(existing && label && existing.label === label);
            rows[key] = {
                row: row,
                icon: icon || null,
                label: label || null,
                lastState: reuseRow && existing ? String(existing.lastState || "") : "",
                lastIcon: reuseIcon && existing ? String(existing.lastIcon || "") : "",
                lastLabel: reuseLabel && existing ? String(existing.lastLabel || "") : ""
            };
        }
        State.cachedPanels[cachedRowsKey] = rows;
        return rows;
    }

    function _RenderLoaderStepRows(stepsWrap, steps, stepRowIdPrefix, iconSuffix, labelSuffix, cachedRowsKey, statePrefix) {
        var rows = _EnsureLoaderStepRows(stepsWrap, steps, stepRowIdPrefix, iconSuffix, labelSuffix, cachedRowsKey);
        if (!rows || typeof rows !== "object") return "";
        for (var i = 0; i < steps.length; i++) {
            var step = steps[i];
            var key = step.key;
            if (!rows.hasOwnProperty(key)) continue;
            var entry = rows[key];
            if (!entry) continue;
            var status = _GetLoaderStepState(statePrefix, key);
            if (entry.row) SetSettingsLoaderStepRowStateClasses(entry.row, status);
            if (entry.label) {
                if (entry.lastLabel !== step.label || entry.label.text !== step.label) {
                    entry.label.text = step.label;
                    entry.lastLabel = step.label;
                }
            }
            if (entry.icon) {
                var iconPath = GetSettingsLoaderIconForState(status);
                if (entry.lastIcon !== iconPath) {
                    try {
                        if (entry.icon.SetImage) entry.icon.SetImage(iconPath);
                        else entry.icon.style.backgroundImage = "url(\"" + iconPath + "\")";
                    } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
                    entry.lastIcon = iconPath;
                }
            }
            ApplySettingsLoaderStepStateFallback(entry, status);
            entry.lastState = status;
        }
        return _BuildLoaderStepStateSignature(statePrefix, steps);
    }

    // ── Generic Overlay Panel Builder ──
    // Used by save + clear overlays (load overlay has too many unique extras for a generic)

    // ── Loader overlay factory (bundles state management + panel helpers) ──
    // Returns an object with methods bound to one overlay's config.

    function _CreateLoaderOverlay(cfg) {
        // cfg: { statePrefix, steps, cachedOverlayKey, enabledCheck, stepRowIdPrefix,
        //        iconSuffix, labelSuffix, cachedStepRowsKey }
        var o = {};
        o.getStepIndex = function(stepKey) { return _GetLoaderStepIndex(stepKey, cfg.steps); };
        o.resetStepStates = function() { _ResetLoaderStepStates(State[cfg.statePrefix + "StepStates"], cfg.steps); };
        o.resetSession = function(hideOverlay) { _ResetLoaderSession(cfg.statePrefix, cfg.cachedOverlayKey, cfg.steps, hideOverlay); };
        o.beginSession = function(requestToken, nowMs, initialDetail) { _BeginLoaderSession(cfg.statePrefix, cfg.steps, requestToken, nowMs, initialDetail, cfg.enabledCheck); };
        o.setStepState = function(stepKey, status, detail) { _SetLoaderStepState(cfg.statePrefix, cfg.steps, stepKey, status, detail, cfg.enabledCheck); };
        o.getStepState = function(stepKey) { return _GetLoaderStepState(cfg.statePrefix, stepKey); };
        o.buildSignature = function() { return _BuildLoaderStepStateSignature(cfg.statePrefix, cfg.steps); };
        o.ensureStepRows = function(stepsWrap) { return _EnsureLoaderStepRows(stepsWrap, cfg.steps, cfg.stepRowIdPrefix, cfg.iconSuffix, cfg.labelSuffix, cfg.cachedStepRowsKey); };
        o.renderStepRows = function(stepsWrap) { return _RenderLoaderStepRows(stepsWrap, cfg.steps, cfg.stepRowIdPrefix, cfg.iconSuffix, cfg.labelSuffix, cfg.cachedStepRowsKey, cfg.statePrefix); };
        return o;
    }

    // ── Settings Loader (load) overlay ──

    function ResetSettingsLoaderStepStates() {
        _ResetLoaderStepStates(State.settingsLoaderStepStates, SETTINGS_LOADER_STEPS);
    }

    function ResetSettingsLoaderSession(hideOverlay) {
        _TLog("load:ResetSession", "hideOverlay=" + (hideOverlay ? "1" : "0") + " prevAccount=" + String(State.settingsLoaderSessionAccountId || "-").slice(0, 8));
        var prevAccountId = State.settingsLoaderSessionAccountId ? String(State.settingsLoaderSessionAccountId) : "";
        State.settingsLoaderSessionAccountId = "";
        State.settingsLoaderSessionActive = false;
        State.settingsLoaderSessionCompleted = false;
        State.settingsLoaderCurrentStep = "";
        State.settingsLoaderDetail = "";
        State.settingsLoaderResult = "";
        State.settingsLoaderShowUntilMs = 0;
        State.settingsLoaderNextReassertMs = 0;
        State.settingsLoaderLastRenderSig = "";
        State.settingsLoaderSkipRequested = false;
        State.settingsLoaderDebugOverlayLine = "";
        State.settingsLoaderTraceLastSig = "";
        State.settingsLoaderTraceNextMs = 0;
        State.buildCategoryPayloadLoaderSessionCreateAttempts = 0;
        State.buildCategoryPayloadMissingScanAdvances = 0;
        State.buildCategoryPayloadCorruptRepairActive = false;
        State.buildCategoryPayloadCorruptRepairStartedMs = 0;
        State.buildCategoryPayloadCorruptRepairCleared = false;
        State.buildCategoryPayloadCorruptRepairClearRetries = 0;
        State.buildCategoryPayloadCorruptRepairClearNextMs = 0;
        State.buildCategoryPayloadCorruptRepairClearEmptyHits = 0;
        State.buildCategoryPayloadCorruptRepairBrowseReady = false;
        State.buildCategoryPayloadCorruptRepairLastDeleteTitle = "";
        State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 0;
        State.buildCategoryPayloadCorruptRepairPostClearUntilMs = 0;
        State.buildCategoryPayloadShopOpenActionNextMs = 0;
        State.buildCategoryPayloadFavoritesActionNextMs = 0;
        State.buildCategoryPayloadBrowseActionNextMs = 0;
        ResetSettingsLoaderStepStates();
        if (hideOverlay) {
            var overlay = GetCachedPanel("settingsLoaderOverlay");
            if (overlay) {
                try { overlay.style.visibility = "collapse"; } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
            }
        }
        SettingsLoaderDebugLog("session_reset account=" + (prevAccountId || "-") + " hideOverlay=" + (hideOverlay ? "1" : "0"));
    }

    function BeginSettingsLoaderSession(accountId, nowMs) {
        if (!SETTINGS_LOADER_ENABLED) return;
        var id = accountId ? String(accountId) : "";
        if (!id) return;
        if (
            State.settingsLoaderSessionAccountId === id &&
            (State.settingsLoaderSessionActive || State.settingsLoaderSessionCompleted)
        ) {
            return;
        }
        _TLog("load:BeginSession", "account=" + String(id).slice(0,8));
        ResetSettingsLoaderStepStates();
        State.settingsLoaderSessionAccountId = id;
        State.settingsLoaderSessionActive = true;
        State.settingsLoaderSessionCompleted = false;
        State.settingsLoaderCurrentStep = "start";
        State.settingsLoaderDetail = "Initializing launch settings load.";
        State.settingsLoaderResult = "";
        State.settingsLoaderShowUntilMs = 0;
        State.settingsLoaderLastRenderSig = "";
        State.settingsLoaderSkipRequested = false;
        State.settingsLoaderTraceLastSig = "";
        State.settingsLoaderTraceNextMs = 0;
        State.buildCategoryPayloadLoaderSessionCreateAttempts = 0;
        State.buildCategoryPayloadMissingScanAdvances = 0;
        State.buildCategoryPayloadCorruptRepairActive = false;
        State.buildCategoryPayloadCorruptRepairStartedMs = 0;
        State.buildCategoryPayloadCorruptRepairCleared = false;
        State.buildCategoryPayloadCorruptRepairClearRetries = 0;
        State.buildCategoryPayloadCorruptRepairClearNextMs = 0;
        State.buildCategoryPayloadCorruptRepairClearEmptyHits = 0;
        State.buildCategoryPayloadCorruptRepairBrowseReady = false;
        State.buildCategoryPayloadCorruptRepairLastDeleteTitle = "";
        State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 0;
        State.buildCategoryPayloadCorruptRepairPostClearUntilMs = 0;
        State.buildCategoryPayloadShopOpenActionNextMs = 0;
        State.buildCategoryPayloadFavoritesActionNextMs = 0;
        State.buildCategoryPayloadBrowseActionNextMs = 0;
        State.settingsLoaderStepStates.start = "active";
        SetSettingsLoaderDebugOverlayLine("acct=" + id + " step=start");
        SettingsLoaderDebugLog("session_begin account=" + id + " nowMs=" + nowMs);
        SettingsLoaderTraceLog("session_begin account=" + id + " nowMs=" + nowMs);
    }

    function SetSettingsLoaderStepState(stepKey, status, detail) {
        _SetLoaderStepState("settingsLoader", SETTINGS_LOADER_STEPS, stepKey, status, detail, function() { return SETTINGS_LOADER_ENABLED; });
    }
    function FinalizeSettingsLoaderSession(resultCode, detail, nowMs) {
        _TLog("load:FinalizeSession", resultCode + " " + (detail || ""));
        if (!SETTINGS_LOADER_ENABLED) return;
        if (!State.settingsLoaderSessionActive && !State.settingsLoaderSessionCompleted) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var code = resultCode ? String(resultCode) : "success";
        State.settingsLoaderResult = code;
        State.settingsLoaderSessionActive = false;
        State.settingsLoaderSessionCompleted = true;
        State.settingsLoaderSkipRequested = false;
        State.settingsLoaderShowUntilMs = now + SETTINGS_LOADER_HOLD_MS;
        SetSettingsLoaderStepState("complete", code === "failed" ? "error" : "done", detail || "");
        State.settingsLoaderCurrentStep = "complete";
        SettingsLoaderDebugLog(
            "session_finalize result=" + code +
            " detail=\"" + String(detail || "") + "\"" +
            " account=" + (State.settingsLoaderSessionAccountId || "-")
        );
        SettingsLoaderTraceLog(
            "session_finalize result=" + code +
            " detail=\"" + String(detail || "") + "\"" +
            " account=" + (State.settingsLoaderSessionAccountId || "-")
        );
        if (code !== "failed") {
            QueueCloseHeroShopForLoaderSuccess();
        }
        if (SETTINGS_LOADER_HOLD_MS <= 0) {
            $.Schedule(0.03, function() {
                ResetSettingsLoaderSession(true);
            });
        }
    }

    function SkipSettingsLoaderSession(root, nowMs) {
        if (!SETTINGS_LOADER_ENABLED) return false;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        if (!State.settingsLoaderSessionActive && !State.settingsLoaderSessionCompleted) return false;

        var accountId = State.settingsLoaderSessionAccountId
            ? String(State.settingsLoaderSessionAccountId)
            : (State.buildCategoryPayloadHeroProbeAccountId ? String(State.buildCategoryPayloadHeroProbeAccountId) : "");
        if (!accountId && root) {
            accountId = String(QOL.getAccountIdForBuildCategoryPayload(root) || "");
        }

        State.settingsLoaderSkipRequested = true;
        SetStartupCorruptRepairPending(root, false);

        if (root) {
            QOL.resetBuildSaveRequestAttributes(root);
            ResetBuildClearRequestAttributes(root);
        }
        QOL.resetBuildSaveRuntimeState();
        ResetBuildClearRuntimeState();
        ResetSaveSettingsLoaderSession(true);
        ResetClearSettingsLoaderSession(true);

        SetSettingsLoaderStepState("read_payload", "skipped", "Loading skipped by user.");
        SetSettingsLoaderStepState("decode_payload", "skipped", "Loading skipped by user.");
        SetSettingsLoaderStepState("apply_config", "skipped", "Config unchanged.");

        var probeWasActive =
            !!(State.buildCategoryPayloadHeroProbeStage && String(State.buildCategoryPayloadHeroProbeStage).length > 0) ||
            State.buildCategoryPayloadHeroProbeDidSwitch ||
            State.buildCategoryPayloadCorruptRepairActive ||
            !!(State.buildCategoryPayloadHeroProbeAccountId && String(State.buildCategoryPayloadHeroProbeAccountId).length > 0);

        if (probeWasActive) {
            QOL.completeBuildCategoryPayloadHeroProbe(
                accountId || String(State.buildCategoryPayloadHeroProbeAccountId || ""),
                true,
                "default",
                "Loading skipped by user. Kept current config."
            );
        } else {
            SetSettingsLoaderStepState("return_hero", "skipped", "No hero return needed.");
            if (accountId && accountId.length > 0) {
                State.buildCategoryPayloadStartupConsumedAccountId = accountId;
                State.buildCategoryPayloadStartupConsumedResult = "default";
                State.buildCategoryPayloadHeroProbeDoneAccountId = accountId;
            }
            QOL.resetBuildCategoryPayloadHeroProbeState();
            FinalizeSettingsLoaderSession("default", "Loading skipped by user. Kept current config.", now);
        }

        SettingsLoaderDebugLog(
            "session_skip account=" + (accountId || "-") +
            " probeActive=" + (probeWasActive ? "1" : "0")
        );
        return true;
    }
    function GetSettingsLoaderIconForState(status) {
        var st = status ? String(status) : "pending";
        if (st === "done") return SETTINGS_LOADER_ICON_DONE;
        if (st === "active") return SETTINGS_LOADER_ICON_ACTIVE;
        if (st === "error") return SETTINGS_LOADER_ICON_ERROR;
        return SETTINGS_LOADER_ICON_PENDING;
    }

    function SetSettingsLoaderStepRowStateClasses(row, status) {
        if (!row || !row.SetHasClass) return;
        var st = status ? String(status) : "pending";
        row.SetHasClass("is-pending", st === "pending");
        row.SetHasClass("is-active", st === "active");
        row.SetHasClass("is-done", st === "done");
        row.SetHasClass("is-skipped", st === "skipped");
        row.SetHasClass("is-error", st === "error");
    }

    function ApplySettingsLoaderStepStateFallback(entry, status) {
        if (!entry) return;
        var theme = GetSettingsUiThemePalette();
        var st = status ? String(status) : "pending";
        var labelColor = "#8d9698";
        var iconWash = "#8d9698";
        var iconOpacity = "0.75";
        if (st === "active") {
            labelColor = theme.accent;
            iconWash = theme.accent;
            iconOpacity = "1.0";
        } else if (st === "done") {
            labelColor = theme.title;
            iconWash = theme.accent;
            iconOpacity = "1.0";
        } else if (st === "skipped") {
            labelColor = "#6f777a";
            iconWash = "#6f777a";
            iconOpacity = "0.45";
        } else if (st === "error") {
            labelColor = theme.warn;
            iconWash = theme.warn;
            iconOpacity = "1.0";
        }
        if (entry.label && entry.label.style) {
            entry.label.style.color = labelColor;
        }
        if (entry.icon && entry.icon.style) {
            entry.icon.style.washColor = iconWash;
            entry.icon.style.opacity = iconOpacity;
        }
    }

    function EnsureSettingsLoaderStepRows(stepsWrap) {
        return _EnsureLoaderStepRows(stepsWrap, SETTINGS_LOADER_STEPS, SETTINGS_LOADER_STEP_ROW_ID_PREFIX, SETTINGS_LOADER_STEP_ICON_ID_SUFFIX, SETTINGS_LOADER_STEP_LABEL_ID_SUFFIX, "settingsLoaderStepRows");
    }
    function RenderSettingsLoaderStepRows(stepsWrap) {
        return _RenderLoaderStepRows(stepsWrap, SETTINGS_LOADER_STEPS, SETTINGS_LOADER_STEP_ROW_ID_PREFIX, SETTINGS_LOADER_STEP_ICON_ID_SUFFIX, SETTINGS_LOADER_STEP_LABEL_ID_SUFFIX, "settingsLoaderStepRows", "settingsLoader");
    }
    // ── Overlay core factory — shared by all three settings loader overlays
    // Config fields: enabled, cachePrefix, overlayId, cardId, warningId, titleId,
    // stepsWrapId, detailId, zIndex, overlayHittestChildren, cardHittestChildren,
    // reassertMs, reassertStateKey, ensureStepRows
    // Note: configs reference step-rows functions defined later in the file;
    // those function declarations are hoisted so the references are valid.

    var SETTINGS_OVERLAY_CFG = {
        enabled: SETTINGS_LOADER_ENABLED,
        cachePrefix: "settingsLoader",
        overlayId: SETTINGS_LOADER_OVERLAY_ID,
        cardId: SETTINGS_LOADER_CARD_ID,
        warningId: SETTINGS_LOADER_WARNING_ID,
        titleId: SETTINGS_LOADER_TITLE_ID,
        stepsWrapId: SETTINGS_LOADER_STEPS_WRAP_ID,
        detailId: SETTINGS_LOADER_DETAIL_ID,
        zIndex: "2147483647",
        overlayHittestChildren: true,
        cardHittestChildren: true,
        reassertMs: SETTINGS_LOADER_REASSERT_MS,
        reassertStateKey: "settingsLoaderNextReassertMs",
        ensureStepRows: EnsureSettingsLoaderStepRows
    };

    var SAVE_OVERLAY_CFG = {
        enabled: SAVE_SETTINGS_LOADER_ENABLED,
        cachePrefix: "saveSettingsLoader",
        overlayId: SAVE_SETTINGS_LOADER_OVERLAY_ID,
        cardId: SAVE_SETTINGS_LOADER_CARD_ID,
        warningId: SAVE_SETTINGS_LOADER_WARNING_ID,
        titleId: SAVE_SETTINGS_LOADER_TITLE_ID,
        stepsWrapId: SAVE_SETTINGS_LOADER_STEPS_WRAP_ID,
        detailId: SAVE_SETTINGS_LOADER_DETAIL_ID,
        zIndex: "2147483646",
        overlayHittestChildren: false,
        cardHittestChildren: false,
        reassertMs: SAVE_SETTINGS_LOADER_REASSERT_MS,
        reassertStateKey: "saveSettingsLoaderNextReassertMs",
        ensureStepRows: EnsureSaveSettingsLoaderStepRows
    };

    var CLEAR_OVERLAY_CFG = {
        enabled: CLEAR_SETTINGS_LOADER_ENABLED,
        cachePrefix: "clearSettingsLoader",
        overlayId: CLEAR_SETTINGS_LOADER_OVERLAY_ID,
        cardId: CLEAR_SETTINGS_LOADER_CARD_ID,
        warningId: CLEAR_SETTINGS_LOADER_WARNING_ID,
        titleId: CLEAR_SETTINGS_LOADER_TITLE_ID,
        stepsWrapId: CLEAR_SETTINGS_LOADER_STEPS_WRAP_ID,
        detailId: CLEAR_SETTINGS_LOADER_DETAIL_ID,
        zIndex: "2147483645",
        overlayHittestChildren: false,
        cardHittestChildren: false,
        reassertMs: CLEAR_SETTINGS_LOADER_REASSERT_MS,
        reassertStateKey: "clearSettingsLoaderNextReassertMs",
        ensureStepRows: EnsureClearSettingsLoaderStepRows
    };

    function EnsureLoaderOverlayCore(root, nowMs, cfg) {
        if (!cfg.enabled || !root) return null;

        var overlay = GetCachedPanel(cfg.cachePrefix + "Overlay");
        if (!overlay) overlay = root.FindChildTraverse ? (root.FindChildTraverse(cfg.overlayId) || null) : null;
        if (!overlay) overlay = $.CreatePanel("Panel", root, cfg.overlayId, {
            hittest: "false",
            hittestchildren: cfg.overlayHittestChildren ? "true" : "false"
        });
        if (!overlay) return null;
        overlay.hittest = false;
        overlay.hittestchildren = cfg.overlayHittestChildren;
        if (overlay.AddClass) overlay.AddClass("QOLSettingsLoaderOverlay");
        overlay.style.horizontalAlign = "left";
        overlay.style.verticalAlign = "top";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.overflow = "noclip";
        overlay.style.visibility = "visible";
        overlay.style.zIndex = cfg.zIndex;
        overlay.style.backgroundColor = GetSettingsUiThemePalette().overlay;
        SetPanelOpacitySafe(overlay, 1.0, 1.0);

        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        if (
            now >= (State[cfg.reassertStateKey] || 0) &&
            root.GetChildCount && root.GetChild && root.MoveChildAfter
        ) {
            var count = root.GetChildCount();
            if (count > 0) {
                var last = root.GetChild(count - 1);
                if (last && last !== overlay) {
                    root.MoveChildAfter(overlay, last);
                }
            }
            State[cfg.reassertStateKey] = now + cfg.reassertMs;
        }

        var card = GetCachedPanel(cfg.cachePrefix + "Card");
        if (!card) card = overlay.FindChildTraverse ? (overlay.FindChildTraverse(cfg.cardId) || null) : null;
        if (!card) card = $.CreatePanel("Panel", overlay, cfg.cardId, {
            hittest: "false",
            hittestchildren: cfg.cardHittestChildren ? "true" : "false"
        });
        if (!card) return overlay;
        card.hittest = false;
        card.hittestchildren = cfg.cardHittestChildren;
        if (card.AddClass) card.AddClass("QOLSettingsLoaderCard");
        ApplyLoaderCardTheme(card);

        var warning = GetCachedPanel(cfg.cachePrefix + "Warning");
        if (!warning) warning = card.FindChildTraverse ? (card.FindChildTraverse(cfg.warningId) || null) : null;
        if (!warning) warning = $.CreatePanel("Label", card, cfg.warningId);
        if (warning) {
            warning.hittest = false;
            warning.hittestchildren = false;
            if (warning.AddClass) warning.AddClass("QOLSettingsLoaderWarning");
            ApplyLoaderWarningTheme(warning);
            if (warning.text !== SETTINGS_LOADER_WARNING_TEXT) warning.text = SETTINGS_LOADER_WARNING_TEXT;
        }

        var title = GetCachedPanel(cfg.cachePrefix + "Title");
        if (!title) title = card.FindChildTraverse ? (card.FindChildTraverse(cfg.titleId) || null) : null;
        if (!title) title = $.CreatePanel("Label", card, cfg.titleId);
        if (title) {
            title.hittest = false;
            title.hittestchildren = false;
            if (title.AddClass) title.AddClass("QOLSettingsLoaderTitle");
            ApplyLoaderTitleTheme(title);
        }
        if (warning && title && card && card.MoveChildAfter) {
            try { card.MoveChildAfter(warning, title); } catch(e0w) { QOL_WARN("core", "op failed: " + (e0w && e0w.message ? e0w.message : String(e0w || ""))); }
        }

        var stepsWrap = GetCachedPanel(cfg.cachePrefix + "StepsWrap");
        if (!stepsWrap) stepsWrap = card.FindChildTraverse ? (card.FindChildTraverse(cfg.stepsWrapId) || null) : null;
        if (!stepsWrap) stepsWrap = $.CreatePanel("Panel", card, cfg.stepsWrapId, { hittest: "false", hittestchildren: "false" });
        if (stepsWrap) {
            stepsWrap.hittest = false;
            stepsWrap.hittestchildren = false;
            if (stepsWrap.AddClass) stepsWrap.AddClass("QOLSettingsLoaderStepsWrap");
            ApplyLoaderStepsWrapTheme(stepsWrap);
            cfg.ensureStepRows(stepsWrap);
        }

        var detailLabel = GetCachedPanel(cfg.cachePrefix + "Detail");
        if (!detailLabel) detailLabel = card.FindChildTraverse ? (card.FindChildTraverse(cfg.detailId) || null) : null;
        if (!detailLabel) detailLabel = $.CreatePanel("Label", card, cfg.detailId);
        if (detailLabel) {
            detailLabel.hittest = false;
            detailLabel.hittestchildren = false;
            if (detailLabel.AddClass) detailLabel.AddClass("QOLSettingsLoaderDetail");
            ApplyLoaderDetailTheme(detailLabel);
        }

        return { overlay: overlay, card: card, warning: warning, title: title, stepsWrap: stepsWrap, detailLabel: detailLabel };
    }

    // ── Settings loader skip-button subsystem (extracted from EnsureSettingsLoaderOverlay)
    function EnsureSettingsLoaderSkipSection(overlay) {
        var skipDock = GetCachedPanel("settingsLoaderSkipDock");
        if (!skipDock) skipDock = overlay.FindChildTraverse ? (overlay.FindChildTraverse(SETTINGS_LOADER_SKIP_DOCK_ID) || null) : null;
        if (!skipDock) skipDock = $.CreatePanel("Panel", overlay, SETTINGS_LOADER_SKIP_DOCK_ID, { hittest: "false", hittestchildren: "true" });
        if (skipDock) {
            skipDock.hittest = false;
            skipDock.hittestchildren = true;
            if (skipDock.AddClass) skipDock.AddClass("QOLSettingsLoaderSkipDock");
            skipDock.style.horizontalAlign = "left";
            skipDock.style.verticalAlign = "top";
            skipDock.style.width = "100%";
            skipDock.style.height = "100%";
            skipDock.style.marginTop = "0px";
            skipDock.style.overflow = "noclip";
            skipDock.style.flowChildren = "none";
        }

        var skipButton = GetCachedPanel("settingsLoaderSkipButton");
        if (!skipButton) skipButton = overlay.FindChildTraverse ? (overlay.FindChildTraverse(SETTINGS_LOADER_SKIP_BUTTON_ID) || null) : null;
        var skipLabel = GetCachedPanel("settingsLoaderSkipLabel");
        if (!skipLabel && skipButton) skipLabel = skipButton.FindChildTraverse ? (skipButton.FindChildTraverse(SETTINGS_LOADER_SKIP_LABEL_ID) || null) : null;

        var skipBacker = GetCachedPanel("settingsLoaderSkipBacker");
        if (!skipBacker) skipBacker = overlay.FindChildTraverse ? (overlay.FindChildTraverse(SETTINGS_LOADER_SKIP_BACKER_ID) || null) : null;
        if (!skipBacker && skipDock) skipBacker = $.CreatePanel("Panel", skipDock, SETTINGS_LOADER_SKIP_BACKER_ID, { hittest: "false", hittestchildren: "false" });
        if (skipBacker) {
            skipBacker.hittest = false;
            skipBacker.hittestchildren = false;
            if (skipBacker.AddClass) skipBacker.AddClass("QOLSettingsLoaderSkipBacker");
            skipBacker.style.horizontalAlign = "left";
            skipBacker.style.verticalAlign = "top";
            skipBacker.style.width = "214px";
            skipBacker.style.minWidth = "214px";
            skipBacker.style.height = "42px";
            skipBacker.style.borderRadius = "4px";
            skipBacker.style.border = "1px solid rgba(210, 224, 216, 0.085)";
            skipBacker.style.backgroundColor = "gradient( linear, 0% 0%, 100% 100%, from( rgba(31, 34, 36, 0.90) ), to( rgba(15, 17, 18, 0.86) ) )";
            skipBacker.style.boxShadow = "fill rgba(0, 0, 0, 0.24) 0px 2px 7px 0px";
            skipBacker.style.x = "0px";
            skipBacker.style.y = "0px";
        }

        try {
            if (skipButton) {
                var skipType = "";
                try { skipType = String(skipButton.paneltype || ""); } catch (eSkipType) { skipType = ""; }
                if (skipType && skipType.toLowerCase() !== "panel") {
                    try { skipButton.DeleteAsync(0); } catch(eSkipDelete) { QOL_WARN("core", "op failed: " + (eSkipDelete && eSkipDelete.message ? eSkipDelete.message : String(eSkipDelete || ""))); }
                    skipButton = null;
                    skipLabel = null;
                }
            }
            if (!skipButton && skipDock) skipButton = $.CreatePanel("Panel", skipDock, SETTINGS_LOADER_SKIP_BUTTON_ID, { hittest: "true", hittestchildren: "false", acceptsfocus: "true" });
            if (skipButton) {
                if (skipDock && skipButton.GetParent && skipButton.GetParent() !== skipDock && skipButton.SetParent) {
                    try { skipButton.SetParent(skipDock); } catch(eMoveSkip) { QOL_WARN("core", "op failed: " + (eMoveSkip && eMoveSkip.message ? eMoveSkip.message : String(eMoveSkip || ""))); }
                }
                if (skipDock && skipBacker && skipDock.MoveChildBefore) {
                    try { skipDock.MoveChildBefore(skipBacker, skipButton); } catch(eMoveBacker) { QOL_WARN("core", "op failed: " + (eMoveBacker && eMoveBacker.message ? eMoveBacker.message : String(eMoveBacker || ""))); }
                }
                skipButton.hittest = true;
                skipButton.hittestchildren = true;
                if (skipButton.AddClass) skipButton.AddClass("QOLSettingsLoaderSkipButton");
                skipButton.style.horizontalAlign = "left";
                skipButton.style.verticalAlign = "top";
                skipButton.style.marginLeft = "0px";
                skipButton.style.marginTop = "0px";
                skipButton.style.width = "214px";
                skipButton.style.minWidth = "214px";
                skipButton.style.height = "42px";
                skipButton.style.paddingLeft = "14px";
                skipButton.style.paddingRight = "14px";
                skipButton.style.borderRadius = "4px";
                skipButton.style.border = "1px solid rgba(255, 126, 126, 0.18)";
                skipButton.style.backgroundColor = "gradient( linear, 0% 0%, 100% 100%, from( rgba(39, 27, 28, 0.90) ), to( rgba(18, 14, 15, 0.86) ) )";
                skipButton.style.backgroundImage = "none";
                skipButton.style.boxShadow = "fill rgba(0, 0, 0, 0.22) 0px 1px 4px 0px, inset rgba(255, 126, 126, 0.10) 0px 1px 0px 0px";
                if (!skipLabel) skipLabel = $.CreatePanel("Label", skipButton, SETTINGS_LOADER_SKIP_LABEL_ID);
                if (skipLabel) {
                    if (skipLabel.AddClass) skipLabel.AddClass("QOLSettingsLoaderSkipButtonLabel");
                    if (skipLabel.text !== SETTINGS_LOADER_SKIP_TEXT) skipLabel.text = SETTINGS_LOADER_SKIP_TEXT;
                    skipLabel.style.width = "100%";
                    skipLabel.style.horizontalAlign = "center";
                    skipLabel.style.verticalAlign = "center";
                    skipLabel.style.textAlign = "center";
                    skipLabel.style.fontFamily = "oracle";
                    skipLabel.style.fontSize = "12px";
                    skipLabel.style.fontWeight = "semi-bold";
                    skipLabel.style.letterSpacing = "0.85px";
                    skipLabel.style.color = "#ffb3b3";
                    skipLabel.style.textShadow = "none";
                    skipLabel.style.textTransform = "uppercase";
                }
                skipButton.SetPanelEvent("onactivate", function() {
                    var clickRoot = GetUIRoot();
                    if (State.settingsLoaderSessionCompleted && !State.settingsLoaderSessionActive) {
                        ResetSettingsLoaderSession(true);
                        return;
                    }
                    SkipSettingsLoaderSession(clickRoot, Date.now ? Date.now() : (new Date()).getTime());
                });
            }
        } catch (eSkipPanelInit) {
            skipButton = null;
            skipLabel = null;
        }

        SetCachedPanel("settingsLoaderSkipDock", skipDock);
        SetCachedPanel("settingsLoaderSkipBacker", skipBacker);
        SetCachedPanel("settingsLoaderSkipButton", skipButton);
        SetCachedPanel("settingsLoaderSkipLabel", skipLabel);
    }

    function EnsureSettingsLoaderOverlay(root, nowMs) {
        var panels = EnsureLoaderOverlayCore(root, nowMs, SETTINGS_OVERLAY_CFG);
        if (!panels) return null;

        // ── Settings-specific: subtitle cleanup ──
        var subtitle = GetCachedPanel("settingsLoaderSubtitle");
        if (!subtitle) subtitle = panels.card.FindChildTraverse ? (panels.card.FindChildTraverse(SETTINGS_LOADER_SUBTITLE_ID) || null) : null;
        if (subtitle) {
            try {
                if (subtitle.DeleteAsync) subtitle.DeleteAsync(0);
                else subtitle.style.visibility = "collapse";
            } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        }
        SetCachedPanel("settingsLoaderSubtitle", null);

        // ── Settings-specific: legacy steps cleanup ──
        var legacySteps = panels.card.FindChildTraverse ? (panels.card.FindChildTraverse(SETTINGS_LOADER_LEGACY_STEPS_ID) || null) : null;
        if (legacySteps) {
            try {
                if (legacySteps.DeleteAsync) legacySteps.DeleteAsync(0);
                else legacySteps.style.visibility = "collapse";
            } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        }

        // ── Settings-specific: actions row ──
        var actionsRow = GetCachedPanel("settingsLoaderActionsRow");
        if (!actionsRow) actionsRow = panels.card.FindChildTraverse ? (panels.card.FindChildTraverse(SETTINGS_LOADER_ACTIONS_ID) || null) : null;
        if (!actionsRow) actionsRow = $.CreatePanel("Panel", panels.card, SETTINGS_LOADER_ACTIONS_ID, { hittest: "false", hittestchildren: "true" });
        if (actionsRow) {
            actionsRow.hittest = false;
            actionsRow.hittestchildren = true;
            if (actionsRow.AddClass) actionsRow.AddClass("QOLSettingsLoaderActions");
            actionsRow.style.width = "fit-children";
            actionsRow.style.horizontalAlign = "right";
            actionsRow.style.flowChildren = "right";
            actionsRow.style.marginTop = "10px";
            actionsRow.style.visibility = "collapse";
        }

        // ── Settings-specific: skip section ──
        EnsureSettingsLoaderSkipSection(panels.overlay);

        SetCachedPanel("settingsLoaderOverlay", panels.overlay);
        SetCachedPanel("settingsLoaderCard", panels.card);
        SetCachedPanel("settingsLoaderWarning", panels.warning);
        SetCachedPanel("settingsLoaderTitle", panels.title);
        SetCachedPanel("settingsLoaderStepsWrap", panels.stepsWrap);
        SetCachedPanel("settingsLoaderDetail", panels.detailLabel);
        SetCachedPanel("settingsLoaderActionsRow", actionsRow);
        return panels.overlay;
    }

    function UpdateSettingsLoaderOverlay(root, nowMs) {
        if (!SETTINGS_LOADER_ENABLED) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var shouldShow = !!State.settingsLoaderSessionActive;
        if (!shouldShow && State.settingsLoaderSessionCompleted) {
            shouldShow = now < (State.settingsLoaderShowUntilMs || 0);
        }
        var overlay = GetCachedPanel("settingsLoaderOverlay");
        if (!shouldShow) {
            if (overlay) {
                try { overlay.style.visibility = "collapse"; } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
            }
            if (State.settingsLoaderSessionCompleted) {
                ResetSettingsLoaderSession(true);
            }
            return;
        }

        overlay = EnsureSettingsLoaderOverlay(root, now);
        if (!overlay) return;
        overlay.style.visibility = "visible";
        SetPanelOpacitySafe(overlay, 1.0, 1.0);

        var title = GetCachedPanel("settingsLoaderTitle");
        var warning = GetCachedPanel("settingsLoaderWarning");
        var stepsWrap = GetCachedPanel("settingsLoaderStepsWrap");
        var detailLabel = GetCachedPanel("settingsLoaderDetail");
        var skipButton = GetCachedPanel("settingsLoaderSkipButton");
        var skipBacker = GetCachedPanel("settingsLoaderSkipBacker");
        var card = GetCachedPanel("settingsLoaderCard");
        if (skipBacker) {
            skipBacker.style.visibility = "collapse";
        }
        if (skipButton) {
            var skipEnabled = !!(State.settingsLoaderSessionActive || State.settingsLoaderSessionCompleted);
            var skipVisible = shouldShow && !State.settingsLoaderSkipRequested;
            try { skipButton.enabled = skipEnabled; } catch(eSkipEnabled) { QOL_WARN("core", "op failed: " + (eSkipEnabled && eSkipEnabled.message ? eSkipEnabled.message : String(eSkipEnabled || ""))); }
            skipButton.style.visibility = skipVisible ? "visible" : "collapse";
            skipButton.style.opacity = skipEnabled ? "1.0" : "0.55";
            if (skipBacker) skipBacker.style.visibility = skipVisible ? "visible" : "collapse";
            if (skipVisible) {
                var desiredX = 12;
                var desiredY = 142;
                if (card) {
                    var cardPos = QOL_UTILS.GetPanelPositionRelativeToAncestor(card, overlay);
                    var overlayWidth = Number(overlay && overlay.actuallayoutwidth);
                    var cardX = cardPos && isFinite(Number(cardPos.x)) ? Number(cardPos.x) : 0;
                    var cardY = cardPos && isFinite(Number(cardPos.y)) ? Number(cardPos.y) : 36;
                    var skipWidth = Number(skipButton.actuallayoutwidth);
                    if (!isFinite(skipWidth) || skipWidth <= 0) skipWidth = 240;
                    desiredX = Math.round(cardX - skipWidth - 14);
                    if (!isFinite(desiredX)) desiredX = 12;
                    if (desiredX < 12) desiredX = 12;
                    if (isFinite(overlayWidth) && overlayWidth > 0) {
                        var maxX = Math.max(12, Math.round(overlayWidth - skipWidth - 12));
                        if (desiredX > maxX) desiredX = maxX;
                    }
                    desiredY = Math.round(cardY + 106);
                    if (!isFinite(desiredY) || desiredY < 0) desiredY = 0;
                }
                skipButton.style.x = String(desiredX) + "px";
                skipButton.style.y = String(desiredY) + "px";
                if (skipBacker) {
                    skipBacker.style.x = String(desiredX) + "px";
                    skipBacker.style.y = String(desiredY) + "px";
                }
            }
        }
        var stepSig = RenderSettingsLoaderStepRows(stepsWrap);
        var resultPrefix = "";
        if (State.settingsLoaderSessionCompleted) {
            if (State.settingsLoaderResult === "success") resultPrefix = "Result: Payload applied.";
            else if (State.settingsLoaderResult === "default") resultPrefix = "Result: Fallback/default applied.";
            else if (State.settingsLoaderResult === "failed") resultPrefix = "Result: Load failed.";
            else resultPrefix = "Result: Complete.";
        }
        var detailText = State.settingsLoaderDetail || "";
        if (resultPrefix.length > 0) {
            detailText = detailText ? (resultPrefix + " " + detailText) : resultPrefix;
        }
        var isShopPromptDetail = IsSettingsLoaderShopPromptDetail(detailText);
        var debugLine = "";
        if (SETTINGS_LOADER_DEBUG && State.settingsLoaderDebugOverlayLine) {
            debugLine = "DBG: " + String(State.settingsLoaderDebugOverlayLine);
            detailText = detailText ? (detailText + "\n" + debugLine) : debugLine;
        }
        var renderDetailText = DecorateLoaderDetailWithSpinner(
            detailText,
            now,
            !!State.settingsLoaderSessionActive,
            !!State.settingsLoaderSessionCompleted
        );
        var sig = stepSig + "|" + renderDetailText + "|" + String(State.settingsLoaderSessionCompleted ? 1 : 0) + "|" + debugLine + "|prompt=" + (isShopPromptDetail ? "1" : "0") + "|skip=" + (skipButton && skipButton.style.visibility === "visible" ? "1" : "0");
        if (sig === State.settingsLoaderLastRenderSig) return;
        State.settingsLoaderLastRenderSig = sig;
        if (warning && warning.text !== SETTINGS_LOADER_WARNING_TEXT) warning.text = SETTINGS_LOADER_WARNING_TEXT;
        if (title && title.text !== "QOL Settings Loader") title.text = "QOL Settings Loader";
        if (detailLabel) {
            ApplyLoaderDetailPromptStyle(detailLabel, isShopPromptDetail);
            if (detailLabel.text !== renderDetailText) detailLabel.text = renderDetailText;
        }
    }

    function IsSettingsLoaderVisibleNow(nowMs) {
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        if (State.settingsLoaderSessionActive) return true;
        if (State.settingsLoaderSessionCompleted && now < (State.settingsLoaderShowUntilMs || 0)) return true;
        return false;
    }

    function IsClearSettingsLoaderVisibleNow(nowMs) {
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        if (State.clearSettingsLoaderSessionActive) return true;
        if (State.clearSettingsLoaderSessionCompleted && now < (State.clearSettingsLoaderShowUntilMs || 0)) return true;
        return false;
    }

    function GetPanelLayoutHeightPx(panel, minPx) {
        var h = 0;
        if (panel) {
            try { h = Number(panel.actuallayoutheight) || 0; } catch (e0) { h = 0; }
        }
        var minHeight = Number(minPx) || 0;
        if (h < minHeight) h = minHeight;
        return Math.round(h);
    }

    function ReadPanelMarginTopPx(panel, fallbackPx) {
        var fallback = Number(fallbackPx) || 0;
        if (!panel || !panel.style) return fallback;
        var raw = panel.style.marginTop ? String(panel.style.marginTop) : "";
        if (!raw || raw.length === 0) return fallback;
        var parsed = parseFloat(raw);
        if (!isFinite(parsed)) return fallback;
        return Math.round(parsed);
    }

    // ── Save overlay config ──
    var _saveLoader = _CreateLoaderOverlay({
        statePrefix: "saveSettingsLoader",
        steps: SAVE_SETTINGS_LOADER_STEPS,
        cachedOverlayKey: "saveSettingsLoaderOverlay",
        enabledCheck: function() { return SAVE_SETTINGS_LOADER_ENABLED; },
        stepRowIdPrefix: SAVE_SETTINGS_LOADER_STEP_ROW_ID_PREFIX,
        iconSuffix: SAVE_SETTINGS_LOADER_STEP_ICON_ID_SUFFIX,
        labelSuffix: SAVE_SETTINGS_LOADER_STEP_LABEL_ID_SUFFIX,
        cachedStepRowsKey: "saveSettingsLoaderStepRows",
    });

    function ResetSaveSettingsLoaderSession(hideOverlay) {
        _saveLoader.resetSession(hideOverlay);
    }

    function BeginSaveSettingsLoaderSession(requestToken, nowMs) {
        _saveLoader.beginSession(requestToken, nowMs, "Initializing save request.");
    }

    function SetSaveSettingsLoaderStepState(stepKey, status, detail) {
        _saveLoader.setStepState(stepKey, status, detail);
    }

    function GetSaveSettingsLoaderStepState(stepKey) {
        return _saveLoader.getStepState(stepKey);
    }

    function FinalizeSaveSettingsLoaderSession(resultCode, detail, nowMs, didSwitchToStorageHero) {
        _TLog("save:FinalizeSession", resultCode + " " + (detail || ""));
        if (!SAVE_SETTINGS_LOADER_ENABLED) return;
        if (!State.saveSettingsLoaderSessionActive && !State.saveSettingsLoaderSessionCompleted) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var code = resultCode ? String(resultCode) : "success";
        var info = detail ? String(detail) : "";
        if (code === "failed") {
            var activeStep = State.saveSettingsLoaderCurrentStep ? String(State.saveSettingsLoaderCurrentStep) : "";
            if (activeStep && activeStep !== "complete") {
                SetSaveSettingsLoaderStepState(activeStep, "error", info || "Save failed.");
            }
        } else if (GetSaveSettingsLoaderStepState("verify_save") === "active") {
            SetSaveSettingsLoaderStepState("verify_save", "done", "Payload verified.");
        }
        if (didSwitchToStorageHero) {
            SetSaveSettingsLoaderStepState("return_hero", "done", "Returned to selected hero.");
        } else {
            SetSaveSettingsLoaderStepState("return_hero", "skipped", "No hero return needed.");
        }
        State.saveSettingsLoaderResult = code;
        State.saveSettingsLoaderSessionActive = false;
        State.saveSettingsLoaderSessionCompleted = true;
        State.saveSettingsLoaderShowUntilMs = now + SAVE_SETTINGS_LOADER_HOLD_MS;
        SetSaveSettingsLoaderStepState("complete", code === "failed" ? "error" : "done", info || "");
        State.saveSettingsLoaderCurrentStep = "complete";
    }

    function GetSaveSettingsLoaderDetailForMessage(statusMessage) {
        var msg = statusMessage ? String(statusMessage) : "";
        if (msg === "starting") return "Initializing save request.";
        if (msg === "switching_to_skyrunner" || msg === "switching_to_airheart") return "Switching to Skyrunner.";
        if (msg === "confirming_skyrunner" || msg === "confirming_airheart") return "Confirming Skyrunner context.";
        if (msg === "storage_not_confirmed") return "Failed to confirm Skyrunner context.";
        if (msg === "reuse_skyrunner_context" || msg === "reuse_airheart_context") return "Reusing confirmed Skyrunner context.";
        if (msg === "waiting_for_shop") return "Waiting for build shop panel.";
        if (msg === "locking_target_build") return "Locking target build selection.";
        if (msg === "target_locked") return "Target build selection locked.";
        if (msg === "initializing_storage_build") return "Initializing storage build.";
        if (msg === "validating_skyrunner_signature" || msg === "validating_airheart_signature") return "Validating Skyrunner signature abilities.";
        if (msg === "opening_edit_mode") return "Opening edit mode.";
        if (msg === "focusing_category") return "Selecting build category.";
        if (msg === "writing_category_name") return "Writing payload into category name.";
        if (msg === "saving") return "Committing build save.";
        if (msg === "verifying") return "Verifying saved payload.";
        if (msg === "retrying_write") return "Retrying payload write.";
        if (msg === "saved") return "Save completed.";
        if (!msg) return "";
        var clean = msg.replace(/_/g, " ");
        if (!clean) return "";
        return clean.charAt(0).toUpperCase() + clean.slice(1) + ".";
    }

    function UpdateSaveSettingsLoaderFromBuildSaveState(stageName, statusMessage) {
        if (!SAVE_SETTINGS_LOADER_ENABLED) return;
        if (!State.saveSettingsLoaderSessionActive || State.saveSettingsLoaderSessionCompleted) return;
        var stage = stageName ? String(stageName) : "";
        var detail = GetSaveSettingsLoaderDetailForMessage(statusMessage);
        SetSaveSettingsLoaderStepState("start", "done", detail || "Save request started.");
        if (stage === "switch_to_storage") {
            SetSaveSettingsLoaderStepState("switch_airheart", "active", detail || "Switching to Skyrunner.");
            return;
        }
        if (stage === "wait_storage_switch" || stage === "confirm_storage_context") {
            SetSaveSettingsLoaderStepState("switch_airheart", "done", "Skyrunner switch command sent.");
            SetSaveSettingsLoaderStepState("confirm_airheart", "active", detail || "Confirming Skyrunner context.");
            return;
        }
        if (stage) {
            SetSaveSettingsLoaderStepState("switch_airheart", "done", "Switched to Skyrunner.");
            SetSaveSettingsLoaderStepState("confirm_airheart", "done", "Skyrunner context confirmed.");
        }
        if (stage === "lock_target_build" || stage === "start" || stage === "wait_editor" || stage === "wait_category_focus") {
            SetSaveSettingsLoaderStepState("prepare_build", "active", detail || "Preparing build UI.");
            return;
        }
        if (stage === "write") {
            SetSaveSettingsLoaderStepState("prepare_build", "done", "Build UI ready.");
            SetSaveSettingsLoaderStepState("write_payload", "active", detail || "Writing payload.");
            return;
        }
        if (stage === "save") {
            SetSaveSettingsLoaderStepState("prepare_build", "done", "Build UI ready.");
            SetSaveSettingsLoaderStepState("write_payload", "done", "Payload written.");
            SetSaveSettingsLoaderStepState("commit_save", "active", detail || "Saving build.");
            return;
        }
        if (stage === "verify") {
            SetSaveSettingsLoaderStepState("prepare_build", "done", "Build UI ready.");
            SetSaveSettingsLoaderStepState("write_payload", "done", "Payload written.");
            SetSaveSettingsLoaderStepState("commit_save", "done", "Save command sent.");
            SetSaveSettingsLoaderStepState("verify_save", "active", detail || "Verifying saved payload.");
            return;
        }
    }

    function EnsureSaveSettingsLoaderStepRows(stepsWrap) {
        return _saveLoader.ensureStepRows(stepsWrap);
    }
    function RenderSaveSettingsLoaderStepRows(stepsWrap) {
        return _saveLoader.renderStepRows(stepsWrap);
    }
    function EnsureSaveSettingsLoaderOverlay(root, nowMs) {
        var panels = EnsureLoaderOverlayCore(root, nowMs, SAVE_OVERLAY_CFG);
        if (!panels) return null;

        // ── Save-specific: stall hint ──
        var stallHint = GetCachedPanel("saveSettingsLoaderStallHint");
        if (!stallHint) stallHint = panels.card.FindChildTraverse ? (panels.card.FindChildTraverse(SAVE_SETTINGS_LOADER_STALL_HINT_ID) || null) : null;
        if (!stallHint) stallHint = $.CreatePanel("Label", panels.card, SAVE_SETTINGS_LOADER_STALL_HINT_ID);
        if (stallHint) {
            stallHint.hittest = false;
            stallHint.hittestchildren = false;
            if (stallHint.AddClass) stallHint.AddClass("QOLSaveSettingsLoaderStallHint");
            stallHint.style.width = "100%";
            stallHint.style.marginTop = "8px";
            stallHint.style.fontFamily = "oracle";
            stallHint.style.fontSize = "13px";
            stallHint.style.lineHeight = "18px";
            stallHint.style.textAlign = "left";
            stallHint.style.color = GetSettingsUiThemePalette().warn;
            stallHint.style.textShadow = "0px 0px 7px rgba(255, 126, 126, 0.12)";
            if (stallHint.text !== SAVE_SETTINGS_LOADER_STALL_HINT_TEXT) stallHint.text = SAVE_SETTINGS_LOADER_STALL_HINT_TEXT;
        }

        SetCachedPanel("saveSettingsLoaderOverlay", panels.overlay);
        SetCachedPanel("saveSettingsLoaderCard", panels.card);
        SetCachedPanel("saveSettingsLoaderWarning", panels.warning);
        SetCachedPanel("saveSettingsLoaderTitle", panels.title);
        SetCachedPanel("saveSettingsLoaderStepsWrap", panels.stepsWrap);
        SetCachedPanel("saveSettingsLoaderDetail", panels.detailLabel);
        SetCachedPanel("saveSettingsLoaderStallHint", stallHint);
        return panels.overlay;
    }

    function UpdateSaveSettingsLoaderOverlay(root, nowMs) {
        if (!SAVE_SETTINGS_LOADER_ENABLED) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var shouldShow = !!State.saveSettingsLoaderSessionActive;
        if (!shouldShow && State.saveSettingsLoaderSessionCompleted) {
            shouldShow = now < (State.saveSettingsLoaderShowUntilMs || 0);
        }
        var overlay = GetCachedPanel("saveSettingsLoaderOverlay");
        if (!shouldShow) {
            if (overlay) {
                try { overlay.style.visibility = "collapse"; } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
            }
            return;
        }

        overlay = EnsureSaveSettingsLoaderOverlay(root, now);
        if (!overlay) return;
        overlay.style.visibility = "visible";
        SetPanelOpacitySafe(overlay, 1.0, 1.0);

        var saveCard = GetCachedPanel("saveSettingsLoaderCard");
        if (saveCard) {
            var saveCardTopPx = 36;
            var startupVisible = IsSettingsLoaderVisibleNow(now);
            var stackUnderStartupLoader = !!startupVisible;
            var startupStackTopPx = 36;
            if (stackUnderStartupLoader) {
                var settingsCard = GetCachedPanel("settingsLoaderCard");
                var settingsCardHeight = GetPanelLayoutHeightPx(settingsCard, 180);
                startupStackTopPx = 36 + settingsCardHeight + 16;
                saveCardTopPx = startupStackTopPx;
            }
            var clearVisible = IsClearSettingsLoaderVisibleNow(now);
            if (clearVisible) {
                var clearCard = GetCachedPanel("clearSettingsLoaderCard");
                var clearFallbackTopPx = stackUnderStartupLoader ? startupStackTopPx : 36;
                var clearTopPx = ReadPanelMarginTopPx(clearCard, clearFallbackTopPx);
                var clearHeightPx = GetPanelLayoutHeightPx(clearCard, 180);
                var stackedSaveTopPx = clearTopPx + clearHeightPx + 12;
                if (stackedSaveTopPx > saveCardTopPx) saveCardTopPx = stackedSaveTopPx;
            }
            var desiredTop = String(saveCardTopPx) + "px";
            if (saveCard.style.marginTop !== desiredTop) {
                saveCard.style.marginTop = desiredTop;
            }
        }

        var title = GetCachedPanel("saveSettingsLoaderTitle");
        var warning = GetCachedPanel("saveSettingsLoaderWarning");
        var stepsWrap = GetCachedPanel("saveSettingsLoaderStepsWrap");
        var detailLabel = GetCachedPanel("saveSettingsLoaderDetail");
        var stallHint = GetCachedPanel("saveSettingsLoaderStallHint");
        var stepSig = RenderSaveSettingsLoaderStepRows(stepsWrap);
        var resultPrefix = "";
        if (State.saveSettingsLoaderSessionCompleted) {
            if (State.saveSettingsLoaderResult === "success") resultPrefix = "Result: Save complete.";
            else if (State.saveSettingsLoaderResult === "failed") resultPrefix = "Result: Save failed.";
            else resultPrefix = "Result: Complete.";
        }
        var detailText = State.saveSettingsLoaderDetail || "";
        if (resultPrefix.length > 0) {
            detailText = detailText ? (resultPrefix + " " + detailText) : resultPrefix;
        }
        var isPromptDetail = IsSettingsLoaderShopPromptDetail(detailText);
        var renderDetailText = DecorateLoaderDetailWithSpinner(
            detailText,
            now,
            !!State.saveSettingsLoaderSessionActive,
            !!State.saveSettingsLoaderSessionCompleted
        );
        var sig = stepSig + "|" + renderDetailText + "|" + String(State.saveSettingsLoaderSessionCompleted ? 1 : 0) + "|prompt=" + (isPromptDetail ? "1" : "0");
        if (sig === State.saveSettingsLoaderLastRenderSig) return;
        State.saveSettingsLoaderLastRenderSig = sig;
        if (warning && warning.text !== SETTINGS_LOADER_WARNING_TEXT) warning.text = SETTINGS_LOADER_WARNING_TEXT;
        if (title && title.text !== "QOL Settings Saver") title.text = "QOL Settings Saver";
        if (detailLabel) {
            ApplyLoaderDetailPromptStyle(detailLabel, isPromptDetail);
            if (detailLabel.text !== renderDetailText) detailLabel.text = renderDetailText;
        }
        if (stallHint && stallHint.text !== SAVE_SETTINGS_LOADER_STALL_HINT_TEXT) {
            stallHint.text = SAVE_SETTINGS_LOADER_STALL_HINT_TEXT;
        }
    }

    // ── Clear overlay config ──
    var _clearLoader = _CreateLoaderOverlay({
        statePrefix: "clearSettingsLoader",
        steps: CLEAR_SETTINGS_LOADER_STEPS,
        cachedOverlayKey: "clearSettingsLoaderOverlay",
        enabledCheck: function() { return CLEAR_SETTINGS_LOADER_ENABLED; },
        stepRowIdPrefix: CLEAR_SETTINGS_LOADER_STEP_ROW_ID_PREFIX,
        iconSuffix: CLEAR_SETTINGS_LOADER_STEP_ICON_ID_SUFFIX,
        labelSuffix: CLEAR_SETTINGS_LOADER_STEP_LABEL_ID_SUFFIX,
        cachedStepRowsKey: "clearSettingsLoaderStepRows",
    });

    function ResetClearSettingsLoaderSession(hideOverlay) {
        _clearLoader.resetSession(hideOverlay);
    }
    function BeginClearSettingsLoaderSession(requestToken, nowMs) {
        _clearLoader.beginSession(requestToken, nowMs, "Initializing clear request.");
    }
    function SetClearSettingsLoaderStepState(stepKey, status, detail) {
        _clearLoader.setStepState(stepKey, status, detail);
    }
    function GetClearSettingsLoaderStepState(stepKey) {
        return _clearLoader.getStepState(stepKey);
    }
    function FinalizeClearSettingsLoaderSession(resultCode, detail, nowMs, didSwitchToStorageHero) {
        if (!CLEAR_SETTINGS_LOADER_ENABLED) return;
        if (!State.clearSettingsLoaderSessionActive && !State.clearSettingsLoaderSessionCompleted) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var code = resultCode ? String(resultCode) : "success";
        var info = detail ? String(detail) : "";
        if (code === "failed") {
            var activeStep = State.clearSettingsLoaderCurrentStep ? String(State.clearSettingsLoaderCurrentStep) : "";
            if (activeStep && activeStep !== "complete") {
                SetClearSettingsLoaderStepState(activeStep, "error", info || "Clear failed.");
            }
        } else if (GetClearSettingsLoaderStepState("verify_clear") === "active") {
            SetClearSettingsLoaderStepState("verify_clear", "done", "Storage build list is empty.");
        }
        if (didSwitchToStorageHero) {
            SetClearSettingsLoaderStepState("return_hero", "done", "Returned to selected hero.");
        } else {
            SetClearSettingsLoaderStepState("return_hero", "skipped", "No hero return needed.");
        }
        State.clearSettingsLoaderResult = code;
        State.clearSettingsLoaderSessionActive = false;
        State.clearSettingsLoaderSessionCompleted = true;
        State.clearSettingsLoaderShowUntilMs = now + CLEAR_SETTINGS_LOADER_HOLD_MS;
        SetClearSettingsLoaderStepState("complete", code === "failed" ? "error" : "done", info || "");
        State.clearSettingsLoaderCurrentStep = "complete";
    }
    function GetClearSettingsLoaderDetailForMessage(statusMessage) {
        var msg = statusMessage ? String(statusMessage) : "";
        if (msg === "starting") return "Initializing clear request.";
        if (msg === "switching_to_skyrunner" || msg === "switching_to_airheart") return "Switching to Skyrunner.";
        if (msg === "confirming_skyrunner" || msg === "confirming_airheart") return "Confirming Skyrunner context.";
        if (msg === "reuse_skyrunner_context" || msg === "reuse_airheart_context") return "Reusing confirmed Skyrunner context.";
        if (msg === "await_user_open_shop") return "Open shop to continue. This will delete your Skyrunner builds, if this is another character press ALT+F4! May need to be ran a few times to full clear.";
        if (msg === "waiting_for_shop") return "Waiting for build shop panel.";
        if (msg === "opening_builds_list") return "Opening builds list.";
        if (msg === "deleting_build") return "Deleting a build.";
        if (msg === "confirming_delete") return "Confirming build deletion.";
        if (msg === "verifying_clear") return "Verifying build list is empty.";
        if (msg === "cleared") return "Clear completed.";
        if (msg === "storage_not_confirmed") return "Failed to confirm Skyrunner context.";
        if (!msg) return "";
        var clean = msg.replace(/_/g, " ");
        if (!clean) return "";
        return clean.charAt(0).toUpperCase() + clean.slice(1) + ".";
    }

    function UpdateClearSettingsLoaderFromBuildClearState(stageName, statusMessage) {
        if (!CLEAR_SETTINGS_LOADER_ENABLED) return;
        if (!State.clearSettingsLoaderSessionActive || State.clearSettingsLoaderSessionCompleted) return;
        var stage = stageName ? String(stageName) : "";
        var detail = GetClearSettingsLoaderDetailForMessage(statusMessage);
        SetClearSettingsLoaderStepState("start", "done", detail || "Clear request started.");
        if (stage === "switch_to_storage") {
            SetClearSettingsLoaderStepState("switch_airheart", "active", detail || "Switching to Skyrunner.");
            return;
        }
        if (stage === "wait_storage_switch") {
            SetClearSettingsLoaderStepState("switch_airheart", "done", "Skyrunner switch command sent.");
            SetClearSettingsLoaderStepState("confirm_airheart", "pending", "Awaiting Skyrunner confirmation.");
            return;
        }
        if (stage === "await_user_shop_open" || stage === "confirm_storage") {
            SetClearSettingsLoaderStepState("switch_airheart", "done", "Skyrunner switch command sent.");
            if (State.buildClearStorageHeroConfirmed || statusMessage === "reuse_skyrunner_context" || statusMessage === "reuse_airheart_context") {
                SetClearSettingsLoaderStepState("confirm_airheart", "done", "Skyrunner context confirmed.");
            } else {
                SetClearSettingsLoaderStepState("confirm_airheart", "active", detail || "Open shop on Skyrunner.");
            }
            return;
        }
        if (stage === "open_browse") {
            SetClearSettingsLoaderStepState("switch_airheart", "done", "Switched to Skyrunner.");
            if (State.buildClearStorageHeroConfirmed || statusMessage === "reuse_skyrunner_context" || statusMessage === "reuse_airheart_context") {
                SetClearSettingsLoaderStepState("confirm_airheart", "done", "Skyrunner context confirmed.");
            } else {
                SetClearSettingsLoaderStepState("confirm_airheart", "pending", "Awaiting Skyrunner confirmation.");
            }
            SetClearSettingsLoaderStepState("open_builds", "active", detail || "Opening builds list.");
            return;
        }
        if (stage === "clear_loop") {
            SetClearSettingsLoaderStepState("switch_airheart", "done", "Switched to Skyrunner.");
            SetClearSettingsLoaderStepState("confirm_airheart", "done", "Skyrunner context confirmed.");
            SetClearSettingsLoaderStepState("open_builds", "done", "Builds list ready.");
            if (statusMessage === "verifying_clear" || statusMessage === "cleared") {
                SetClearSettingsLoaderStepState("delete_builds", "done", "Build delete actions completed.");
                SetClearSettingsLoaderStepState("verify_clear", "active", detail || "Verifying build list is empty.");
            } else {
                SetClearSettingsLoaderStepState("delete_builds", "active", detail || "Deleting builds.");
            }
            return;
        }
    }

    function EnsureClearSettingsLoaderStepRows(stepsWrap) {
        return _clearLoader.ensureStepRows(stepsWrap);
    }
    function RenderClearSettingsLoaderStepRows(stepsWrap) {
        return _clearLoader.renderStepRows(stepsWrap);
    }
    function EnsureClearSettingsLoaderOverlay(root, nowMs) {
        var panels = EnsureLoaderOverlayCore(root, nowMs, CLEAR_OVERLAY_CFG);
        if (!panels) return null;

        SetCachedPanel("clearSettingsLoaderOverlay", panels.overlay);
        SetCachedPanel("clearSettingsLoaderCard", panels.card);
        SetCachedPanel("clearSettingsLoaderWarning", panels.warning);
        SetCachedPanel("clearSettingsLoaderTitle", panels.title);
        SetCachedPanel("clearSettingsLoaderStepsWrap", panels.stepsWrap);
        SetCachedPanel("clearSettingsLoaderDetail", panels.detailLabel);
        return panels.overlay;
    }

    function UpdateClearSettingsLoaderOverlay(root, nowMs) {
        if (!CLEAR_SETTINGS_LOADER_ENABLED) return;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var shouldShow = !!State.clearSettingsLoaderSessionActive;
        if (!shouldShow && State.clearSettingsLoaderSessionCompleted) {
            shouldShow = now < (State.clearSettingsLoaderShowUntilMs || 0);
        }
        var overlay = GetCachedPanel("clearSettingsLoaderOverlay");
        if (!shouldShow) {
            if (overlay) {
                try { overlay.style.visibility = "collapse"; } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
            }
            return;
        }

        overlay = EnsureClearSettingsLoaderOverlay(root, now);
        if (!overlay) return;
        overlay.style.visibility = "visible";
        SetPanelOpacitySafe(overlay, 1.0, 1.0);

        var clearCard = GetCachedPanel("clearSettingsLoaderCard");
        if (clearCard) {
            var clearCardTopPx = 36;
            if (IsSettingsLoaderVisibleNow(now)) {
                var startupCard = GetCachedPanel("settingsLoaderCard");
                clearCardTopPx = 36 + GetPanelLayoutHeightPx(startupCard, 180) + 16;
            }
            var clearTop = String(clearCardTopPx) + "px";
            if (clearCard.style.marginTop !== clearTop) {
                clearCard.style.marginTop = clearTop;
            }
        }

        var title = GetCachedPanel("clearSettingsLoaderTitle");
        var warning = GetCachedPanel("clearSettingsLoaderWarning");
        var stepsWrap = GetCachedPanel("clearSettingsLoaderStepsWrap");
        var detailLabel = GetCachedPanel("clearSettingsLoaderDetail");
        var stepSig = RenderClearSettingsLoaderStepRows(stepsWrap);
        var resultPrefix = "";
        if (State.clearSettingsLoaderSessionCompleted) {
            if (State.clearSettingsLoaderResult === "success") resultPrefix = "Result: Clear complete.";
            else if (State.clearSettingsLoaderResult === "failed") resultPrefix = "Result: Clear failed.";
            else resultPrefix = "Result: Complete.";
        }
        var detailText = State.clearSettingsLoaderDetail || "";
        if (resultPrefix.length > 0) detailText = detailText ? (resultPrefix + " " + detailText) : resultPrefix;
        var isPromptDetail = IsSettingsLoaderShopPromptDetail(detailText);
        var renderDetailText = DecorateLoaderDetailWithSpinner(
            detailText,
            now,
            !!State.clearSettingsLoaderSessionActive,
            !!State.clearSettingsLoaderSessionCompleted
        );
        var sig = stepSig + "|" + renderDetailText + "|" + String(State.clearSettingsLoaderSessionCompleted ? 1 : 0) + "|prompt=" + (isPromptDetail ? "1" : "0");
        if (sig === State.clearSettingsLoaderLastRenderSig) return;
        State.clearSettingsLoaderLastRenderSig = sig;
        if (warning && warning.text !== SETTINGS_LOADER_WARNING_TEXT) warning.text = SETTINGS_LOADER_WARNING_TEXT;
        if (title && title.text !== "QOL Settings Clearer") title.text = "QOL Settings Clearer";
        if (detailLabel) {
            ApplyLoaderDetailPromptStyle(detailLabel, isPromptDetail);
            if (detailLabel.text !== renderDetailText) detailLabel.text = renderDetailText;
        }
    }

    function PulseShopAfterBuildPayloadStartupReturn() {
        var root = GetUIRoot();
        if (!root || !IsConnectedToHideout(root)) return false;
        var wasOpen = IsHudClassActive(root, "gShopOpen");
        if (wasOpen) {
            var preClosed = false;
            try {
                if (typeof CitadelExitUpgradeShop === "function") {
                    CitadelExitUpgradeShop();
                    preClosed = true;
                }
            } catch(e0c) { QOL_WARN("core", "op failed: " + (e0c && e0c.message ? e0c.message : String(e0c || ""))); }
            if (!preClosed) {
                var preShopPanel = root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_HERO_SHOP) : null;
                var preLeftCommandPanel = preShopPanel && preShopPanel.FindChildTraverse ? preShopPanel.FindChildTraverse("LeftCommandPanel") : null;
                if (ActivatePanelSafe(preLeftCommandPanel)) preClosed = true;
            }
            if (!preClosed) {
                QOL.dispatchCitadelConCommand("-openherosheet");
            }
        }

        var opened = false;
        try {
            if (typeof CitadelEnterUpgradeShop === "function") {
                CitadelEnterUpgradeShop();
                opened = true;
            }
        } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        if (!opened) {
            try {
                if (typeof CitadelToggleUpgradeShop === "function") {
                    CitadelToggleUpgradeShop();
                    opened = true;
                }
            } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        }
        if (!opened) {
            var actionUpgrade = FindFirstPanelByClass(root, "action_upgrade");
            if (ActivatePanelSafe(actionUpgrade)) {
                opened = true;
            }
        }
        if (!opened) {
            opened = QOL.dispatchCitadelConCommand("+openherosheet") || QOL.dispatchCitadelConCommand("openherosheet");
        }

        $.Schedule(BUILD_CATEGORY_PAYLOAD_POST_SWITCH_SHOP_CLOSE_DELAY_SEC, function() {
            var closeRoot = GetUIRoot();
            if (!closeRoot || !IsConnectedToHideout(closeRoot)) return;
            var closed = false;
            try {
                if (typeof CitadelExitUpgradeShop === "function") {
                    CitadelExitUpgradeShop();
                    closed = true;
                }
            } catch(e2) { QOL_WARN("core", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
            if (!closed) {
                var shopPanel = closeRoot.FindChildTraverse ? closeRoot.FindChildTraverse(PANEL_ID_HERO_SHOP) : null;
                var leftCommandPanel = shopPanel && shopPanel.FindChildTraverse ? shopPanel.FindChildTraverse("LeftCommandPanel") : null;
                if (ActivatePanelSafe(leftCommandPanel)) {
                    closed = true;
                }
            }
            if (!closed) {
                QOL.dispatchCitadelConCommand("-openherosheet");
            }
        });

        return opened || wasOpen;
    }

    function TryCloseBrowseBuildsPopupForLoader(root) {
        if (!root || !IsConnectedToHideout(root)) return false;
        var cancelLookup = FindBrowseBuildsCancelButton(root);
        var cancelBtn = cancelLookup && cancelLookup.panel ? cancelLookup.panel : null;
        if (!cancelBtn || !IsPanelVisibleMaybe(cancelBtn)) return false;
        return ActivatePanelSafe(cancelBtn);
    }

    function TryCloseHeroShopForLoader(root) {
        if (!root || !IsConnectedToHideout(root)) return false;
        var closedBrowsePopup = TryCloseBrowseBuildsPopupForLoader(root);
        var wasOpen = IsHudClassActive(root, "gShopOpen");
        if (!wasOpen) return closedBrowsePopup || true;

        var closed = false;
        try {
            if (typeof CitadelExitUpgradeShop === "function") {
                CitadelExitUpgradeShop();
                closed = true;
            }
        } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        if (!closed) {
            var shopPanel = root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_HERO_SHOP) : null;
            var leftCommandPanel = shopPanel && shopPanel.FindChildTraverse ? shopPanel.FindChildTraverse("LeftCommandPanel") : null;
            if (ActivatePanelSafe(leftCommandPanel)) closed = true;
        }
        if (!closed) {
            QOL.dispatchCitadelConCommand("-openherosheet");
            closed = true;
        }
        return closed || closedBrowsePopup;
    }

    function QueueCloseHeroShopForLoaderSuccess() {
        var delays = [0.00, 0.20, 0.55];
        for (var i = 0; i < delays.length; i++) {
            var delaySec = delays[i];
            $.Schedule(delaySec, function() {
                var closeRoot = GetUIRoot();
                TryCloseHeroShopForLoader(closeRoot);
            });
        }
    }

    function QueueShopPulseAfterHeroRestore(nowMs) {
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        if (now < (State.heroRestoreShopPulseNextMs || 0)) return;
        State.heroRestoreShopPulseNextMs = now + 1200;
        $.Schedule(BUILD_CATEGORY_PAYLOAD_POST_SWITCH_SHOP_OPEN_DELAY_SEC, PulseShopAfterBuildPayloadStartupReturn);
    }

    function FindShopFavoritesNavButton(root) {
        var cached = GetCachedPanel("shopFavoritesNavButton");
        if (cached) return cached;

        var favoritesNav = null;
        if (root && root.FindChildTraverse) {
            favoritesNav = root.FindChildTraverse("FavoritesNav");
        }
        if (!favoritesNav) {
            var uiRoot = GetUIRoot();
            if (uiRoot && uiRoot.FindChildTraverse) {
                favoritesNav = uiRoot.FindChildTraverse("FavoritesNav");
            }
        }
        if (!favoritesNav) {
            var roots = CollectBuildUiSearchRoots(root);
            for (var i = 0; i < roots.length; i++) {
                var host = roots[i];
                if (!host || !host.FindChildTraverse) continue;
                var probe = null;
                try { probe = host.FindChildTraverse("FavoritesNav"); } catch (e0) { probe = null; }
                if (probe && IsPanelValid(probe)) {
                    favoritesNav = probe;
                    break;
                }
            }
        }

        SetCachedPanel("shopFavoritesNavButton", (favoritesNav && IsPanelValid(favoritesNav)) ? favoritesNav : null);
        return GetCachedPanel("shopFavoritesNavButton");
    }

    function EnsureShopFavoritesNavActive(root, nowMs, stateField, cooldownMs) {
        var favoritesNav = FindShopFavoritesNavButton(root);
        if (!favoritesNav || !IsPanelValid(favoritesNav)) {
            SetCachedPanel("shopFavoritesNavButton", null);
            return false;
        }
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var field = stateField ? String(stateField) : "";
        var cd = Number(cooldownMs);
        if (!isFinite(cd) || cd < 0) cd = BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS;
        if (field.length > 0 && !QOL.shouldRunBuildCategoryPayloadUiAction(now, field, cd)) {
            return false;
        }
        return ActivatePanelSafe(favoritesNav);
    }

    function TryOpenHeroShopForHeroProbe(root, nowMs) {
        if (!root || !IsConnectedToHideout(root)) return false;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        if (IsHudClassActive(root, "gShopOpen")) {
            EnsureShopFavoritesNavActive(root, now, "buildCategoryPayloadFavoritesActionNextMs", BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS);
            return true;
        }

        var opened = false;
        if ((State.openItemShopLastMs || 0) > now - 1000) return false;
        State.openItemShopLastMs = now;
        // open_item_shop is the only confirmed working path in the current game build.
        // It routes via CitadelConCommand -> RunConCommand -> Engine ClientCmd,
        // which sends the predicted command to the server's ClientCommand dispatcher.
        // CitadelOpenUpgradeShop is a type-0 notification event (native->JS), not an
        // action. CitadelEnterUpgradeShop / CitadelToggleUpgradeShop do not exist
        // in any decompiled DLL (0 occurrences in client.dll, server.dll).
        if (!opened) {
            opened = QOL.dispatchCitadelConCommand("open_item_shop");
        }
        if (!opened) {
            try {
                if (typeof CitadelOpenUpgradeShop === "function") {
                    CitadelOpenUpgradeShop();
                    opened = true;
                }
            } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        }
        if (!opened) {
            try {
                if (typeof CitadelEnterUpgradeShop === "function") {
                    CitadelEnterUpgradeShop();
                    opened = true;
                }
            } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        }
        if (!opened) {
            try {
                if (typeof CitadelToggleUpgradeShop === "function") {
                    CitadelToggleUpgradeShop();
                    opened = true;
                }
            } catch(e2) { QOL_WARN("core", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
        }
        if (!opened) {
            var actionUpgrade = FindFirstPanelByClass(root, "action_upgrade");
            if (ActivatePanelSafe(actionUpgrade)) opened = true;
        }
        if (!opened) {
            opened = QOL.dispatchCitadelConCommand("+openherosheet") || QOL.dispatchCitadelConCommand("openherosheet");
        }
        if (opened || IsHudClassActive(root, "gShopOpen")) {
            EnsureShopFavoritesNavActive(root, now, "buildCategoryPayloadFavoritesActionNextMs", BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS);
        }
        return opened;
    }
    function ResetStartupDefaultPayloadBootstrapState() {
        State.buildCategoryPayloadDefaultBootstrapPayloadText = "";
        State.buildCategoryPayloadDefaultBootstrapRetries = 0;
        State.buildCategoryPayloadDefaultBootstrapSaveToken = "";
        State.buildCategoryPayloadDefaultBootstrapSaveVerifyHits = 0;
        State.buildCategoryPayloadDefaultBootstrapPostSavePrompt = false;
    }

    function EnterStartupCorruptRepairPrompt(root, nowMs, reason) {
        var why = reason ? String(reason) : "unknown";
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        SetStartupCorruptRepairPending(root, true);
        // Startup corruption repair uses loader-owned clear; suppress standalone clear queue if present.
        ResetBuildClearRequestAttributes(root);
        ResetBuildClearRuntimeState();
        if (CLEAR_SETTINGS_LOADER_ENABLED) {
            ResetClearSettingsLoaderSession(true);
        }
        SetSettingsLoaderStepState("switch_airheart", "done", "Skyrunner switch command sent.");
        SetSettingsLoaderStepState("confirm_airheart", "active", "Verifying Skyrunner context for repair.");
        SetSettingsLoaderStepState("read_payload", "active", "Corrupt payload detected. Running automatic repair.");
        SetSettingsLoaderStepState("decode_payload", "skipped", "Repair bootstrap in progress.");
        SetSettingsLoaderStepState("apply_config", "skipped", "Waiting for repaired payload.");
        State.buildCategoryPayloadPromptEscClosed = true;
        State.buildCategoryPayloadDefaultBootstrapPostSavePrompt = false;
        State.buildCategoryPayloadDefaultBootstrapRetries = 0;
        State.buildCategoryPayloadDefaultBootstrapSaveToken = "";
        State.buildCategoryPayloadDefaultBootstrapSaveVerifyHits = 0;
        State.buildCategoryPayloadCorruptRepairActive = true;
        State.buildCategoryPayloadCorruptRepairStartedMs = now;
        State.buildCategoryPayloadCorruptRepairCleared = false;
        State.buildCategoryPayloadCorruptRepairClearRetries = 0;
        State.buildCategoryPayloadCorruptRepairClearNextMs = now;
        State.buildCategoryPayloadCorruptRepairClearEmptyHits = 0;
        State.buildCategoryPayloadCorruptRepairBrowseReady = false;
        State.buildCategoryPayloadCorruptRepairLastDeleteTitle = "";
        State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 0;
        State.buildCategoryPayloadCorruptRepairPostClearUntilMs = 0;
        State.buildCategoryPayloadHeroProbeStage = "bootstrap_via_save_enqueue";
        State.buildCategoryPayloadHeroProbeNextMs = now;
        SettingsLoaderDebugLog("payload_override entering automatic repair bootstrap reason=" + why);
        SetSettingsLoaderDebugOverlayLine("corrupt repair bootstrap reason=" + why);
    }
    function CleanStorageHeroSignatureText(text) {
        if (text === null || text === undefined) return "";
        var clean = String(text).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
        if (!clean || clean.length === 0) return "";
        if (/^\{[a-zA-Z]:.+\}$/.test(clean)) return "";
        if (/^waiting\.?\.?\.?$/i.test(clean)) return "";
        return clean;
    }

        // ── Language-agnostic ASCII folding ──
    var _sigFoldDiagLogged = false;

    // ── Language-agnostic ASCII folding ──
// Maps ALL Latin-script accented/diacritic characters (Latin-1 Supplement
    // U+0080-U+00FF, Latin Extended-A U+0100-U+017F) to their base ASCII
    // lowercase form in a single universal pass.
    function FoldToAscii(str) {
        if (!str) return "";
        return String(str)
            .replace(/[\u00C0-\u00C5]/g, "a")
            .replace(/\u00C6/g, "ae")
            .replace(/\u00C7/g, "c")
            .replace(/[\u00C8-\u00CB]/g, "e")
            .replace(/[\u00CC-\u00CF]/g, "i")
            .replace(/\u00D0/g, "d")
            .replace(/\u00D1/g, "n")
            .replace(/[\u00D2-\u00D6\u00D8]/g, "o")
            .replace(/[\u00D9-\u00DC]/g, "u")
            .replace(/\u00DD/g, "y")
            .replace(/\u00DE/g, "th")
            .replace(/\u00DF/g, "ss")
            .replace(/[\u00E0-\u00E5]/g, "a")
            .replace(/\u00E6/g, "ae")
            .replace(/\u00E7/g, "c")
            .replace(/[\u00E8-\u00EB]/g, "e")
            .replace(/[\u00EC-\u00EF]/g, "i")
            .replace(/\u00F0/g, "d")
            .replace(/\u00F1/g, "n")
            .replace(/[\u00F2-\u00F6\u00F8]/g, "o")
            .replace(/[\u00F9-\u00FC]/g, "u")
            .replace(/[\u00FD\u00FF]/g, "y")
            .replace(/\u00FE/g, "th")
            .replace(/[\u0100\u0102\u0104]/g, "a") .replace(/[\u0101\u0103\u0105]/g, "a")
            .replace(/[\u0106\u0108\u010A\u010C]/g, "c") .replace(/[\u0107\u0109\u010B\u010D]/g, "c")
            .replace(/[\u010E\u0110]/g, "d") .replace(/[\u010F\u0111]/g, "d")
            .replace(/[\u0112\u0114\u0116\u0118\u011A]/g, "e") .replace(/[\u0113\u0115\u0117\u0119\u011B]/g, "e")
            .replace(/[\u011C\u011E\u0120\u0122]/g, "g") .replace(/[\u011D\u011F\u0121\u0123]/g, "g")
            .replace(/[\u0124\u0126]/g, "h") .replace(/[\u0125\u0127]/g, "h")
            .replace(/[\u0128\u012A\u012C\u012E\u0130]/g, "i") .replace(/[\u0129\u012B\u012D\u012F\u0131]/g, "i")
            .replace(/[\u0132]/g, "ij") .replace(/[\u0133]/g, "ij")
            .replace(/[\u0134]/g, "j") .replace(/[\u0135]/g, "j")
            .replace(/[\u0136]/g, "k") .replace(/[\u0137]/g, "k")
            .replace(/[\u0139\u013B\u013D\u013F\u0141]/g, "l") .replace(/[\u013A\u013C\u013E\u0140\u0142]/g, "l")
            .replace(/[\u0143\u0145\u0147]/g, "n") .replace(/[\u0144\u0146\u0148]/g, "n")
            .replace(/[\u014C\u014E\u0150]/g, "o") .replace(/[\u014D\u014F\u0151]/g, "o")
            .replace(/[\u0152]/g, "oe") .replace(/[\u0153]/g, "oe")
            .replace(/[\u0154\u0156\u0158]/g, "r") .replace(/[\u0155\u0157\u0159]/g, "r")
            .replace(/[\u015A\u015C\u015E\u0160]/g, "s") .replace(/[\u015B\u015D\u015F\u0161]/g, "s")
            .replace(/[\u0162\u0164\u0166]/g, "t") .replace(/[\u0163\u0165\u0167]/g, "t")
            .replace(/[\u0168\u016A\u016C\u016E\u0170\u0172]/g, "u") .replace(/[\u0169\u016B\u016D\u016F\u0171\u0173]/g, "u")
            .replace(/[\u0174]/g, "w") .replace(/[\u0175]/g, "w")
            .replace(/[\u0176\u0178]/g, "y") .replace(/[\u0177]/g, "y")
            .replace(/[\u0179\u017B\u017D]/g, "z") .replace(/[\u017A\u017C\u017E]/g, "z")
            .replace(/\u017F/g, "s");
    }

    function NormalizeStorageHeroSignatureAbilityName(text) {
        var clean = CleanStorageHeroSignatureText(text);
        if (!clean) return "";
        // Language-agnostic ASCII folding replaces .toLowerCase():
        // FoldToAscii maps ALL Latin-script characters to ASCII base
        // in a single pass - no per-language branches needed.
        var folded = FoldToAscii(clean).toLowerCase();
        var normalized = folded
            .replace(/&/g, "and")
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
        // [LANG DIAG] One-shot diagnostic
        if (!_sigFoldDiagLogged) {
            _sigFoldDiagLogged = true;
            $.Msg('[QOLLock][LANG] NormalizeStorageHeroSignatureAbilityName: raw="' + String(text) + '" clean="' + String(clean) + '" folded="' + String(folded) + '" normalized="' + String(normalized) + '"');
        }
        if (!normalized) return "";
        // Language-agnostic fallback: use locale lookup table (generated from
        // Deadlock's localization files) to resolve translated ability names
        // like "Hayat İpliği" → "ability_skyrunner_swingline".
        if (typeof QOL !== "undefined" && typeof QOL.lookupLocaleAbility === "function") {
            var localeAbility = QOL.lookupLocaleAbility(clean);
            if (localeAbility) {
                $.Msg("[QOLLock][LANG] NormalizeStorageHeroSignatureAbilityName: locale lookup resolved \"" + String(clean) + "\" → \"" + String(localeAbility) + "\"");
                return localeAbility;
            }
        }
        if (normalized.indexOf("rutger") !== -1 && normalized.indexOf("rocket") !== -1) return "rutger_rocket";
        if (normalized.indexOf("hyper") !== -1 && normalized.indexOf("beam") !== -1) return "hyper_beam";
        if (normalized.indexOf("skyrunner") !== -1 && normalized.indexOf("magic") !== -1 && normalized.indexOf("beam") !== -1) return "ability_skyrunner_magic_beam";
        if (normalized.indexOf("skyrunner") !== -1 && normalized.indexOf("ability02") !== -1) return "ability_skyrunner_magic_beam";
        return normalized;
    }


    function AddStorageSignatureScanRoot(roots, panel) {
        if (!panel || !IsPanelValid(panel)) return;
        for (var i = 0; i < roots.length; i++) {
            if (roots[i] === panel) return;
        }
        roots.push(panel);
    }

    function FindStorageHeroSignatureHud(root) {
        var roots = [];
        AddStorageSignatureScanRoot(roots, root);
        try {
            var contextPanel = $.GetContextPanel ? $.GetContextPanel() : null;
            AddStorageSignatureScanRoot(roots, contextPanel);
            var top = contextPanel;
            var sigRootGuard = 0;
            while (top && IsPanelValid(top) && top.GetParent && top.GetParent() && sigRootGuard < 64) {
                top = top.GetParent();
                sigRootGuard++;
            }
            if (sigRootGuard >= 64) QOL_WARN("buildPayload", "storage signature root walk hit guard limit");
            AddStorageSignatureScanRoot(roots, top);
        } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }

        for (var i = 0; i < roots.length; i++) {
            var scanRoot = roots[i];
            if (!scanRoot || !IsPanelValid(scanRoot)) continue;
            if (ReadPanelIdTextMaybe(scanRoot) === PANEL_ID_SIGNATURE) return scanRoot;
            if (!scanRoot.FindChildTraverse) continue;
            try {
                var hud = scanRoot.FindChildTraverse(PANEL_ID_SIGNATURE);
                if (hud && IsPanelValid(hud)) return hud;
            } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        }
        return null;
    }

    function GetStorageHeroSignatureSlotPanel(root, signatureHud, index) {
        var slotId = BUILD_SAVE_STORAGE_SIGNATURE_SLOT_IDS[index] || "";
        var slot = null;
        if (signatureHud && IsPanelValid(signatureHud) && signatureHud.FindChildTraverse && slotId) {
            try { slot = signatureHud.FindChildTraverse(slotId); } catch (e0) { slot = null; }
        }
        if ((!slot || !IsPanelValid(slot)) && root && IsPanelValid(root) && root.FindChildTraverse && slotId) {
            try { slot = root.FindChildTraverse(slotId); } catch (e1) { slot = null; }
        }
        if ((!slot || !IsPanelValid(slot)) && signatureHud && IsPanelValid(signatureHud) && signatureHud.GetChildCount) {
            try {
                if (signatureHud.GetChildCount() > index) {
                    slot = signatureHud.GetChild(index);
                }
            } catch (e2) {
                slot = null;
            }
        }
        return (slot && IsPanelValid(slot)) ? slot : null;
    }

    function ExtractAbilityNameFromImageSrc(src) {
        if (!src) return "";
        var s = String(src).toLowerCase();
        var match = s.match(/\/abilities\/([a-z0-9_.-]+?)(?:_psd)?\.(?:vtex|png|jpg|tga|psd)/i);
        if (match && match[1]) {
            var name = String(match[1]);
            if (name.length > 0 && name.length < 128) return name;
        }
        match = s.match(/[\/\\]([a-z0-9_.-]+?)(?:_psd)?\.(?:vtex|png|jpg|tga|psd)/i);
        if (match && match[1]) {
            var name = String(match[1]);
            if (name.length > 0 && name.length < 128) return name;
        }
        return "";
    }

    function ReadAbilityNameFromSlotImage(slotPanel) {
        if (!slotPanel || !IsPanelValid(slotPanel) || !slotPanel.FindChildrenWithClassTraverse) return "";
        var imagePanels = null;
        try { imagePanels = slotPanel.FindChildrenWithClassTraverse("ability_image"); } catch (e0) { imagePanels = null; }
        if (!imagePanels || imagePanels.length < 1) {
            try { imagePanels = slotPanel.FindChildrenWithClassTraverse("image_container"); } catch (e1) { imagePanels = null; }
        }
        if (!imagePanels || imagePanels.length < 1) {
            return "";
        }
        var srcsTried = [];
        for (var i = 0; i < imagePanels.length; i++) {
            var imgPanel = imagePanels[i];
            if (!imgPanel || !IsPanelValid(imgPanel)) continue;
            var src = GetImageSrc(imgPanel);
            if (!src) {
                srcsTried.push("(no src)");
                continue;
            }
            srcsTried.push(src);
            var abilityName = ExtractAbilityNameFromImageSrc(src);
            if (abilityName) {
                return abilityName;
            }
        }
        return "";
    }

    function ReadStorageHeroSignatureAbilityName(slotPanel) {
        if (!slotPanel || !IsPanelValid(slotPanel) || !slotPanel.FindChildrenWithClassTraverse) return "";

        var imageName = ReadAbilityNameFromSlotImage(slotPanel);
        if (imageName) {
            return imageName;
        }


        var nameLabels = null;
        try { nameLabels = slotPanel.FindChildrenWithClassTraverse("ability_name"); } catch (e0) { nameLabels = null; }
        if (!nameLabels || nameLabels.length < 1) return "";
        for (var i = 0; i < nameLabels.length; i++) {
            var label = nameLabels[i];
            if (!label || !IsPanelValid(label)) continue;
            var text = CleanStorageHeroSignatureText(ReadPanelTextMaybe(label));
            if (text) {
                return text;
            }
        }
        return "";
    }

    function ReadStorageHeroSignatureSlots(root) {
        var signatureHud = FindStorageHeroSignatureHud(root);
        var scan = {
            hudFound: !!(signatureHud && IsPanelValid(signatureHud)),
            foundSlots: 0,
            names: [],
            normalized: [],
            sig: ""
        };
        var sigParts = [];
        for (var i = 0; i < BUILD_SAVE_STORAGE_SIGNATURE_SLOT_IDS.length; i++) {
            var slot = GetStorageHeroSignatureSlotPanel(root, signatureHud, i);
            if (slot) scan.foundSlots += 1;
            var name = ReadStorageHeroSignatureAbilityName(slot);
            var normalized = NormalizeStorageHeroSignatureAbilityName(name);
            scan.names[i] = name;
            scan.normalized[i] = normalized;
            sigParts.push(normalized || "-");
        }
        scan.sig = "hud:" + (scan.hudFound ? "1" : "0") +
            "|slots:" + String(scan.foundSlots) +
            "|names:" + sigParts.join("|");
        return scan;
    }

    function ValidateStorageHeroSignatureScan(scan) {
        if (!scan || (!scan.hudFound && Number(scan.foundSlots) <= 0)) {
            return { ok: false, detail: "Waiting for Skyrunner signature HUD." };
        }
        for (var i = 0; i < BUILD_SAVE_STORAGE_SIGNATURE_EXPECTED.length; i++) {
            var expected = BUILD_SAVE_STORAGE_SIGNATURE_EXPECTED[i] || "";
            var expectedLabel = BUILD_SAVE_STORAGE_SIGNATURE_LABELS[i] || expected || "Waiting...";
            var actual = (scan.normalized && scan.normalized[i]) ? String(scan.normalized[i]) : "";
            var actualLabel = (scan.names && scan.names[i]) ? String(scan.names[i]) : (actual || "Waiting...");
            if (expected === "*") {
                if (!actual) {
                    return {
                        ok: false,
                        detail: "Waiting for Skyrunner signature slot " + String(i + 1) + " (any ability)."
                    };
                }
            } else if (expected) {
                if (!actual) {
                    return {
                        ok: false,
                        detail: "Waiting for Skyrunner signature slot " + String(i + 1) + " (" + expectedLabel + ")."
                    };
                }
                if (actual !== expected) {
                    return {
                        ok: false,
                        detail: "Skyrunner signature mismatch slot " + String(i + 1) + ": expected " + expectedLabel + ", saw " + actualLabel + "."
                    };
                }
            }
        }
        return { ok: true, detail: "Skyrunner signature abilities confirmed." };
    }

    function ConfirmStorageHeroSignatureAbilities(root, nowMs, requiredHits) {
        var required = Number(requiredHits);
        if (!isFinite(required) || required < 1) required = 1;
        var scan = ReadStorageHeroSignatureSlots(root);
        var validation = ValidateStorageHeroSignatureScan(scan);
        var sig = (scan && scan.sig ? scan.sig : "missing") + "|ok:" + (validation.ok ? "1" : "0");
        if (!validation.ok) {
            if (State.storageHeroSignatureConfirmSig !== sig) {
                State.storageHeroSignatureConfirmSig = sig;
            }
            State.storageHeroSignatureConfirmHits = 0;
            State.storageHeroSignatureLastDetail = validation.detail || "Waiting for Skyrunner signature abilities.";
            return {
                confirmed: false,
                source: "signature_abilities",
                detail: State.storageHeroSignatureLastDetail,
                signature: sig,
                hits: 0
            };
        }

        if (State.storageHeroSignatureConfirmSig !== sig) {
            State.storageHeroSignatureConfirmSig = sig;
            State.storageHeroSignatureConfirmHits = 1;
        } else {
            State.storageHeroSignatureConfirmHits = (Number(State.storageHeroSignatureConfirmHits) || 0) + 1;
        }

        var hits = Number(State.storageHeroSignatureConfirmHits) || 0;
        var confirmed = hits >= required;
        State.storageHeroSignatureLastDetail = confirmed
            ? validation.detail
            : "Skyrunner signature pending hits " + String(hits) + "/" + String(required) + ".";
        return {
            confirmed: confirmed,
            source: "signature_abilities",
            detail: State.storageHeroSignatureLastDetail,
            signature: sig,
            hits: hits
        };
    }

    function EnsureStorageHeroFavoritesHeaderVisible(root, nowMs) {
        if (!root) return false;
        var signal = QOL.tryReadBuildCategoryPayloadStorageHeroFromFavoritesHeader(root);
        var hero = QOL.normalizeHeroId(signal.hero);
        if (hero === BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID) return true;

        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var acted = false;
        if (!IsHudClassActive(root, "gShopOpen")) {
            if (QOL.shouldRunBuildCategoryPayloadUiAction(now, "buildCategoryPayloadShopOpenActionNextMs", BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS)) {
                if (TryOpenHeroShopForHeroProbe(root, now)) acted = true;
            }
        }
        var favoritesNav = FindShopFavoritesNavButton(root);
        if (EnsureShopFavoritesNavActive(root, now, "buildCategoryPayloadFavoritesActionNextMs", BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS)) acted = true;
        SettingsLoaderTraceLogThrottled(
            "ensure_favorites|" + (hero || "-") + "|" + (acted ? "1" : "0"),
            "ensure_favorites hero=" + (hero || "-") +
                " source=" + (signal && signal.source ? String(signal.source) : "none") +
                " acted=" + (acted ? "1" : "0") +
                " shopOpen=" + (IsHudClassActive(root, "gShopOpen") ? "1" : "0") +
                " hasFavoritesNav=" + (favoritesNav ? "1" : "0"),
            now
        );
        return acted;
    }

    function EnsureStorageBuildInitialized(root, nowMs) {
        if (!root || !root.FindChildTraverse) return false;
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var selectedBuild = GetCachedPanel("shopModsSelectedBuild");
        if (!selectedBuild) selectedBuild = root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD);
        if (!IsPanelValid(selectedBuild)) selectedBuild = null;
        SetCachedPanel("shopModsSelectedBuild", selectedBuild);
        var initCreateLookup = FindCreateBuildButtonStrict(root);
        var initCreateBtn = initCreateLookup && initCreateLookup.panel ? initCreateLookup.panel : null;

        if (selectedBuild && QOL.countBuildCategoryHeaders(selectedBuild) > 0 && !(initCreateBtn && IsPanelVisibleMaybe(initCreateBtn))) {
            QOL.resetBuildCategoryPayloadProbeInitState();
            return true;
        }

        if (now < (State.buildCategoryPayloadHeroProbeInitNextMs || 0)) return false;
        if (State.buildCategoryPayloadHeroProbeInitRetries >= BUILD_CATEGORY_PAYLOAD_INIT_MAX_RETRIES) return false;

        var stage = State.buildCategoryPayloadHeroProbeInitStage || "browse";
        // [LANG DIAG] Trace stage progression
        $.Msg("[QOLLock][LANG] EnsureStorageBuildInitialized: stage=" + stage + " retries=" + String(Number(State.buildCategoryPayloadHeroProbeInitRetries) || 0) + " createAttempts=" + String(Number(State.buildCategoryPayloadHeroProbeInitCreateAttempts) || 0));
        var activated = false;
        var progressed = false;
        State.buildCategoryPayloadHeroProbeInitAttempted = true;

        if (stage === "browse") {
            var browseLookup = FindBrowseBuildsButton(root);
            var browseBtn = browseLookup && browseLookup.panel ? browseLookup.panel : null;
            if (ActivatePanelSafe(browseBtn)) {
                activated = true;
                progressed = true;
            }
            // Always advance to create stage after browse attempt.
            stage = "create";
            State.buildCategoryPayloadHeroProbeInitRetries += 1;
            State.buildCategoryPayloadHeroProbeInitStage = stage;
            State.buildCategoryPayloadHeroProbeInitNextMs = now + BUILD_CATEGORY_PAYLOAD_INIT_STEP_DELAY_MS;
            return false;
        }

        if (stage === "create") {
            // Re-check before creating: if any category exists, reuse it.
            selectedBuild = root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD);
            if (!IsPanelValid(selectedBuild)) selectedBuild = null;
            SetCachedPanel("shopModsSelectedBuild", selectedBuild);
            if (!IsStorageBuildListEmpty(root)) {
                QOL.resetBuildCategoryPayloadProbeInitState();
                return true;
            }

            var createAttempts = Number(State.buildCategoryPayloadHeroProbeInitCreateAttempts) || 0;
            // If we already triggered a build creation and it hasn't appeared
            // in the list yet, don't create duplicates — skip to create_verify.
            if (createAttempts > 0) {
                stage = "create_verify";
                State.buildCategoryPayloadHeroProbeInitRetries += 1;
                State.buildCategoryPayloadHeroProbeInitStage = stage;
                State.buildCategoryPayloadHeroProbeInitNextMs = now + BUILD_CATEGORY_PAYLOAD_INIT_STEP_DELAY_MS;
                return false;
            }
            var loaderSessionCreateAttempts = Number(State.buildCategoryPayloadLoaderSessionCreateAttempts) || 0;
            var enforceLoaderSessionCap = !!State.settingsLoaderSessionActive;
            if (enforceLoaderSessionCap && loaderSessionCreateAttempts >= BUILD_CATEGORY_PAYLOAD_LOADER_SESSION_MAX_CREATE_ATTEMPTS) {
                stage = "verify";
                State.buildCategoryPayloadHeroProbeInitRetries += 1;
                State.buildCategoryPayloadHeroProbeInitStage = stage;
                State.buildCategoryPayloadHeroProbeInitNextMs = now + BUILD_CATEGORY_PAYLOAD_INIT_VERIFY_DELAY_MS;
                return false;
            }
            if (createAttempts >= BUILD_CATEGORY_PAYLOAD_INIT_MAX_CREATE_ATTEMPTS) {
                stage = "verify";
                State.buildCategoryPayloadHeroProbeInitRetries += 1;
                State.buildCategoryPayloadHeroProbeInitStage = stage;
                State.buildCategoryPayloadHeroProbeInitNextMs = now + BUILD_CATEGORY_PAYLOAD_INIT_VERIFY_DELAY_MS;
                return false;
            }

            // No-build path: BrowseBuildsButton -> CreateBuildButton.
            // Do not fall back to add-category here; create build must happen first.
            var createLookup = FindCreateBuildButtonStrict(root);
            var createBuildBtn = createLookup && createLookup.panel ? createLookup.panel : null;
            var createTrigger = TryTriggerCreateBuild(createBuildBtn);
            if (createTrigger.ok) {
                State.buildCategoryPayloadHeroProbeInitCreateAttempts = createAttempts + 1;
                if (enforceLoaderSessionCap) {
                    State.buildCategoryPayloadLoaderSessionCreateAttempts = loaderSessionCreateAttempts + 1;
                }
                State.buildCategoryPayloadHeroProbeInitCreateVerifyUntilMs = now + BUILD_CATEGORY_PAYLOAD_INIT_CREATE_VERIFY_WINDOW_MS;
                activated = true;
                progressed = true;
                stage = "create_verify";
            } else {
                // If we cannot find/create from this tree, re-open browse on next step and retry.
                stage = "browse";
            }
            State.buildCategoryPayloadHeroProbeInitRetries += 1;
            State.buildCategoryPayloadHeroProbeInitStage = stage;
            State.buildCategoryPayloadHeroProbeInitNextMs = now + BUILD_CATEGORY_PAYLOAD_INIT_STEP_DELAY_MS;
            return false;
        }

        if (stage === "create_verify") {
            selectedBuild = root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD);
            if (!IsPanelValid(selectedBuild)) selectedBuild = null;
            SetCachedPanel("shopModsSelectedBuild", selectedBuild);

            var createdSignal = !IsStorageBuildListEmpty(root);
            // [LANG DIAG] Trace build detection after create
            $.Msg("[QOLLock][LANG] EnsureStorageBuildInitialized: stage=create_verify createdSignal=" + (createdSignal ? "1" : "0") + " heroBuildItems=" + String(CountHeroBuildListItems(root, true)) + " storageEmpty=" + (IsStorageBuildListEmpty(root) ? "1" : "0"));
            var saveLookupVerify = FindSaveBuildButtonStrict(root, selectedBuild);
            var saveBtnVerify = saveLookupVerify && saveLookupVerify.panel ? saveLookupVerify.panel : null;
            if (createdSignal) {
                stage = "save";
                State.buildCategoryPayloadHeroProbeInitRetries += 1;
                State.buildCategoryPayloadHeroProbeInitStage = stage;
                State.buildCategoryPayloadHeroProbeInitNextMs = now + BUILD_CATEGORY_PAYLOAD_INIT_STEP_DELAY_MS;
                return false;
            }

            var verifyUntilMs = Number(State.buildCategoryPayloadHeroProbeInitCreateVerifyUntilMs) || 0;
            if (verifyUntilMs <= 0) verifyUntilMs = now + BUILD_CATEGORY_PAYLOAD_INIT_VERIFY_DELAY_MS;
            if (now < verifyUntilMs) {
                State.buildCategoryPayloadHeroProbeInitRetries += 1;
                State.buildCategoryPayloadHeroProbeInitStage = "create_verify";
                State.buildCategoryPayloadHeroProbeInitNextMs = now + BUILD_CATEGORY_PAYLOAD_INIT_VERIFY_DELAY_MS;
                return false;
            }

            stage = "browse";
            State.buildCategoryPayloadHeroProbeInitRetries += 1;
            State.buildCategoryPayloadHeroProbeInitStage = stage;
            State.buildCategoryPayloadHeroProbeInitNextMs = now + BUILD_CATEGORY_PAYLOAD_INIT_STEP_DELAY_MS;
            return false;
        }

        if (stage === "save") {
            selectedBuild = root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD);
            if (!IsPanelValid(selectedBuild)) selectedBuild = null;
            SetCachedPanel("shopModsSelectedBuild", selectedBuild);

            var saveLookup = FindSaveBuildButtonStrict(root, selectedBuild);
            var saveBtn = saveLookup && saveLookup.panel ? saveLookup.panel : null;
            if (saveBtn && ActivatePanelSafe(saveBtn)) {
                activated = true;
                progressed = true;
                stage = "verify";
            }
            if (!progressed && !saveBtn) {
                stage = "browse";
            }
            State.buildCategoryPayloadHeroProbeInitRetries += 1;
            State.buildCategoryPayloadHeroProbeInitStage = stage;
            State.buildCategoryPayloadHeroProbeInitNextMs = now + BUILD_CATEGORY_PAYLOAD_INIT_VERIFY_DELAY_MS;
            return false;
        }

        selectedBuild = root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD);
        if (!IsPanelValid(selectedBuild)) selectedBuild = null;
        SetCachedPanel("shopModsSelectedBuild", selectedBuild);
        if (selectedBuild && QOL.countBuildCategoryHeaders(selectedBuild) > 0) {
            QOL.resetBuildCategoryPayloadProbeInitState();
            return true;
        }

        State.buildCategoryPayloadHeroProbeInitRetries += 1;
        State.buildCategoryPayloadHeroProbeInitStage = "browse";
        State.buildCategoryPayloadHeroProbeInitNextMs = now + BUILD_CATEGORY_PAYLOAD_INIT_STEP_DELAY_MS;
        return false;
    }

    function ReadPanelTextMaybe(panel) {
        if (!panel) return "";
        var text = "";
        try {
            if (panel.text !== undefined && panel.text !== null) {
                text = String(panel.text);
            }
        } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        if (text && text.length > 0) return text;
        if (panel.GetAttributeString) {
            try {
                text = panel.GetAttributeString("text", "");
            } catch (e1) {
                text = "";
            }
        }
        return text || "";
    }

    function CollapseShowBuildIdPanel() {
        var panel = GetCachedPanel("showBuildIdPanel");
        if (!panel) return;
        SetStyleSafe(panel, "visibility", "collapse");
        var label = GetCachedPanel("showBuildIdLabel");
        if (label) {
            try { label.text = ""; } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        }
        State.showBuildIdStyleSig = "";
        State.showBuildIdLastLabel = null;
    }

    function ParseSelectedBuildInfoText(rawText) {
        var raw = String(rawText || "").trim();
        if (!raw || raw.length <= 0) return null;
        var parts = raw.split(" - ");
        var buildId = String(parts[0] || "").replace(/,/g, "").trim();
        var buildName = String(parts[1] || "").trim();
        var buildVersion = parseInt(String(parts[2] || "0").replace(/,/g, ""), 10);
        if (!buildId || buildId === "0") return null;
        return {
            id: buildId,
            name: buildName || "Unknown",
            visibility: buildVersion > 0 ? "Public" : "Private"
        };
    }

    function EnsureShowBuildIdPanel(root) {
        if (!root || !$.CreatePanel) return null;
        var lowerLeft = GetCachedPanel("lowerLeft");
        if (!lowerLeft) {
            lowerLeft = root.FindChildTraverse ? root.FindChildTraverse("LowerLeft") : null;
            SetCachedPanel("lowerLeft", lowerLeft);
        }
        if (!lowerLeft) return null;

        var panel = GetCachedPanel("showBuildIdPanel");
        if (!panel) {
            panel = lowerLeft.FindChildTraverse ? lowerLeft.FindChildTraverse("selected_build_info") : null;
        }
        if (!panel) {
            try {
                panel = $.CreatePanel("Panel", lowerLeft, "selected_build_info", { hittest: "false", hittestchildren: "false" });
            } catch (e0) {
                panel = null;
            }
        }
        if (!panel) return null;
        SetCachedPanel("showBuildIdPanel", panel);

        var label = GetCachedPanel("showBuildIdLabel");
        if (!label) {
            label = panel.FindChildTraverse ? panel.FindChildTraverse("build_info") : null;
        }
        if (!label) {
            try {
                label = $.CreatePanel("Label", panel, "build_info", { hittest: "false" });
            } catch (e1) {
                label = null;
            }
        }
        SetCachedPanel("showBuildIdLabel", label);
        return label ? { panel: panel, label: label } : null;
    }

    function UpdateShowBuildIdRuntime(root, cfg) {
        if (!root || Number(cfg && cfg.ENABLE_SHOW_BUILD_ID) !== 1) {
            CollapseShowBuildIdPanel();
            return;
        }
        var source = GetCachedPanel("selectedBuildInfoTitle");
        if (!source) {
            source = root.FindChildTraverse ? root.FindChildTraverse("SelectedBuildInfoTitle") : null;
            SetCachedPanel("selectedBuildInfoTitle", source);
        }
        var parsed = ParseSelectedBuildInfoText(ReadPanelTextMaybe(source));
        if (!parsed) {
            CollapseShowBuildIdPanel();
            return;
        }
        var target = EnsureShowBuildIdPanel(root);
        if (!target) return;

        var showTitle = IsCfgEnabled(cfg, "ENABLE_SHOW_BUILD_ID_TITLE");
        var displayText = parsed.visibility + " Build: " + parsed.id + (showTitle ? " - " + parsed.name : "");
        var sig = displayText + "|" + (showTitle ? "1" : "0");
        var forceApply = State.showBuildIdLastLabel !== target.label;
        SetStyleSafe(target.panel, "visibility", "visible");
        if (State.showBuildIdStyleSig === sig && !forceApply) return;

        SetStyleSafe(target.panel, "marginLeft", "26px");
        SetStyleSafe(target.panel, "verticalAlign", "bottom");
        SetStyleSafe(target.panel, "height", "24px");
        SetStyleSafe(target.panel, "flowChildren", "right");
        SetStyleSafe(target.panel, "zIndex", "5");
        try { target.label.text = displayText; } catch(e2) { QOL_WARN("core", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
        try { target.label.html = true; } catch(e3) { QOL_WARN("core", "op failed: " + (e3 && e3.message ? e3.message : String(e3 || ""))); }
        SetStyleSafe(target.label, "whiteSpace", "nowrap");
        SetStyleSafe(target.label, "fontSize", "16px");
        SetStyleSafe(target.label, "fontWeight", "bold");
        SetStyleSafe(target.label, "fontFamily", "oracle, blocky, sans-serif");
        SetStyleSafe(target.label, "color", "offWhite");
        SetStyleSafe(target.label, "textShadow", "0px 1px 3px 3.0 #000000cc");
        State.showBuildIdStyleSig = sig;
        State.showBuildIdLastLabel = target.label;
    }

    function ExtractBuildCategoryPayloadToken(rawText) {
        if (!rawText) return "";
        var normalized = String(rawText).replace(/\s+/g, "");
        if (!normalized || normalized.length === 0) return "";
        var match = normalized.match(BUILD_CATEGORY_PAYLOAD_TOKEN_EXTRACT_REGEX);
        if (!match || !match[1]) return "";
        return String(match[1]);
    }

    function ResetBuildLoaderForTempDisable(root) {
        if (State.settingsLoaderSessionActive || State.settingsLoaderSessionCompleted) {
            ResetSettingsLoaderSession(true);
        }
        if (!!(State.buildCategoryPayloadHeroProbeStage && State.buildCategoryPayloadHeroProbeStage.length > 0)) {
            QOL.resetBuildCategoryPayloadHeroProbeState();
        }
        State.buildCategoryPayloadHeroProbeAccountId = "";
        State.buildCategoryPayloadHeroProbeDoneAccountId = "";
        State.buildCategoryPayloadHeroProbeRetryAfterMs = 0;
        State.buildCategoryPayloadHeroProbeMisses = 0;
        State.buildCategoryPayloadDoneRearmNextMs = 0;
        State.buildCategoryPayloadDoneRearmAttempts = 0;
        State.buildCategoryPayloadStartupConsumedAccountId = "";
        State.buildCategoryPayloadStartupConsumedResult = "";
        State.buildCategoryPayloadStartupSuppressedForSession = false;
        State.buildCategoryPayloadStartupSuppressedReason = "";
        State.buildCategoryPayloadStartupSuppressedAccountId = "";
        State.buildCategoryPayloadCorruptRepairActive = false;
        State.buildCategoryPayloadDormant = true;
        State.buildCategoryPayloadDormantReason = "temp_disabled";
        State.buildCategoryPayloadDormantWakeCheckNextMs = 0;
        State.buildCategoryPayloadPostSwitchShopPulseDone = false;
        if (root && root.SetAttributeString) {
            try {
                SetStartupCorruptRepairPending(root, false);
            } catch(eTempDisable) { QOL_WARN("core", "op failed: " + (eTempDisable && eTempDisable.message ? eTempDisable.message : String(eTempDisable || ""))); }
        }
    }

    function SuppressStartupLoaderForSession(root, accountId, reason, nowMs) {
        var id = accountId ? String(accountId) : "";
        var why = reason ? String(reason) : "suppressed";
        State.buildCategoryPayloadStartupSuppressedForSession = true;
        State.buildCategoryPayloadStartupSuppressedReason = why;
        State.buildCategoryPayloadStartupSuppressedAccountId = id;
        if (id.length > 0) {
            State.buildCategoryPayloadStartupConsumedAccountId = id;
            State.buildCategoryPayloadStartupConsumedResult = why;
            State.buildCategoryPayloadHeroProbeDoneAccountId = id;
        }
        State.buildCategoryPayloadDormant = true;
        State.buildCategoryPayloadDormantReason = "startup_suppressed_session";
        State.buildCategoryPayloadDormantWakeCheckNextMs = 0;

        if (
            State.settingsLoaderSessionActive ||
            State.settingsLoaderSessionCompleted ||
            !!(State.buildCategoryPayloadHeroProbeStage && State.buildCategoryPayloadHeroProbeStage.length > 0) ||
            State.buildCategoryPayloadCorruptRepairActive
        ) {
            ResetSettingsLoaderSession(true);
            QOL.resetBuildCategoryPayloadHeroProbeState();
            State.buildCategoryPayloadHeroProbeAccountId = "";
            State.buildCategoryPayloadHeroProbeRetryAfterMs = 0;
            State.buildCategoryPayloadHeroProbeMisses = 0;
            State.buildCategoryPayloadDoneRearmNextMs = 0;
            State.buildCategoryPayloadDoneRearmAttempts = 0;
            State.buildCategoryPayloadPostSwitchShopPulseDone = false;
            SetStartupCorruptRepairPending(root, false);
        }

        SettingsLoaderDebugLog(
            "startup_loader_session_suppressed account=" + (id || "-") +
            " reason=" + why +
            " nowMs=" + String(Number(nowMs) || 0)
        );
    }

    function ResetBuildClearRuntimeState() {
        State.buildClearActiveToken = "";
        State.buildClearStage = "";
        State.buildClearStartedMs = 0;
        State.buildClearNextActionMs = 0;
        State.buildClearRetries = 0;
        State.buildClearDeletedCount = 0;
        State.buildClearEmptyConfirmHits = 0;
        State.buildClearDidSwitchToStorageHero = false;
        State.buildClearReturnHero = "";
        State.buildClearStorageHeroConfirmed = false;
        State.buildClearStorageHeroConfirmedSource = "";
        State.buildClearStorageConfirmRetries = 0;
        State.buildClearStorageSwitchRetries = 0;
        State.buildClearStorageConfirmStartedMs = 0;
        State.buildClearUserShopGateSatisfied = false;
    }

    function SetBuildClearStatus(root, state, message, token) {
        if (!root || !root.SetAttributeString) return;
        var st = state ? String(state) : "";
        var msg = message ? String(message) : "";
        var tok = token ? String(token) : "";
        root.SetAttributeString(BUILD_CLEAR_STATE_ATTR, st);
        root.SetAttributeString(BUILD_CLEAR_MSG_ATTR, msg);
        if (tok.length > 0) {
            root.SetAttributeString(BUILD_CLEAR_TOKEN_ATTR, tok);
        }
    }

    // (debug infrastructure removed — BuildSaveDebugLog/Throttled/Snapshot, BuildClearDebugLog/Throttled, SetBuildClearDebugOverlayLine)

    function GetBuildSaveHudPanel(root) {
        if (!root || !root.FindChildTraverse) return null;
        var hudBuilds = GetCachedPanel("buildSaveHudPanel");
        if (hudBuilds && hudBuilds.FindChildTraverse) {
            try {
                var probeEntry = hudBuilds.FindChildTraverse("CategoryNameTextEntry");
                if (probeEntry) {
                    return hudBuilds;
                }
            } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        }
        hudBuilds = root.FindChildTraverse("CitadelHudHeroBuilds");
        SetCachedPanel("buildSaveHudPanel", hudBuilds);
        return hudBuilds || null;
    }

    function CollectBuildUiSearchRoots(root) {
        var roots = [];
        function pushUnique(panel) {
            if (!panel || !IsPanelValid(panel)) return;
            PushUnique(roots, panel);
        }

        pushUnique(root);
        try { pushUnique(GetUIRoot()); } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        pushUnique(GetCachedPanel("buildSaveHudPanel"));
        pushUnique(GetCachedPanel("shopModsSelectedBuild"));
        if (root && root.FindChildTraverse) {
            pushUnique(root.FindChildTraverse("CitadelHudHeroBuilds"));
            pushUnique(root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD));
        }

        var walk = root;
        var guard = 0;
        while (walk && walk.GetParent && guard < 64) {
            walk = walk.GetParent();
            if (!walk) break;
            pushUnique(walk);
            guard++;
        }

        try {
            if (typeof $ !== "undefined" && $.GetContextPanel) {
                var ctx = $.GetContextPanel();
                pushUnique(ctx);
                var ctxWalk = ctx;
                var ctxGuard = 0;
                while (ctxWalk && ctxWalk.GetParent && ctxGuard < 64) {
                    ctxWalk = ctxWalk.GetParent();
                    if (!ctxWalk) break;
                    pushUnique(ctxWalk);
                    ctxGuard++;
                }
            }
        } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }

        return roots;
    }

    function ReadPanelTextDeepLower(panel, maxPanels) {
        if (!panel) return "";
        var limit = Number(maxPanels);
        if (!isFinite(limit) || limit <= 0) limit = 12;
        var out = [];
        var stack = [panel];
        var scanned = 0;
        while (stack.length > 0 && scanned < limit) {
            var cur = stack.pop();
            if (!cur) continue;
            scanned++;
            var txt = ReadPanelTextMaybe(cur);
            if (txt && String(txt).length > 0) {
                out.push(String(txt).toLowerCase());
            }
            var cc = 0;
            try { cc = cur.GetChildCount ? cur.GetChildCount() : 0; } catch (e0) { cc = 0; }
            for (var i = 0; i < cc; i++) {
                var ch = null;
                try { ch = cur.GetChild(i); } catch (e1) { ch = null; }
                if (ch) stack.push(ch);
            }
        }
        return out.join(" ");
    }

    function IsPanelVisibleMaybe(panel) {
        if (!panel || !IsPanelValid(panel)) return false;
        try {
            if (panel.visible === false) return false;
        } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        var vis = "";
        try {
            if (panel.style && panel.style.visibility !== undefined && panel.style.visibility !== null) {
                vis = String(panel.style.visibility || "").toLowerCase();
            }
        } catch (e1) {
            vis = "";
        }
        if (vis === "collapse" || vis === "none" || vis === "hidden") return false;
        return true;
    }

    function FindBuildButtonPanel(root, buttonId, labelNeedle) {
        var idNeedle = buttonId ? String(buttonId).toLowerCase() : "";
        var labelNeed = labelNeedle ? String(labelNeedle).toLowerCase() : "";
        var roots = CollectBuildUiSearchRoots(root);
        var scanned = 0;

        for (var r = 0; r < roots.length; r++) {
            var base = roots[r];
            if (!base || !base.FindChildTraverse) continue;
            var direct = null;
            try { direct = base.FindChildTraverse(buttonId); } catch (e0) { direct = null; }
            if (direct && IsPanelValid(direct)) {
                return { panel: direct, scanned: scanned, roots: roots.length, source: "direct" };
            }
        }

        var maxPanels = 8000;
        for (var i = 0; i < roots.length && scanned < maxPanels; i++) {
            var rootPanel = roots[i];
            if (!rootPanel) continue;
            var stack = [rootPanel];
            while (stack.length > 0 && scanned < maxPanels) {
                var panel = stack.pop();
                if (!panel) continue;
                scanned++;

                var idText = (ReadPanelIdTextMaybe(panel) || "").toLowerCase();
                var classText = (ReadPanelClassTextMaybe(panel) || "").toLowerCase();
                var typeText = (ReadPanelTypeTextMaybe(panel) || "").toLowerCase();
                var textText = (ReadPanelTextMaybe(panel) || "").toLowerCase();
                var onactivate = "";
                try { onactivate = panel.GetAttributeString ? String(panel.GetAttributeString("onactivate", "") || "").toLowerCase() : ""; } catch (e1) { onactivate = ""; }

                var idMatch = !!(idNeedle && idText === idNeedle);
                var idContains = !!(idNeedle && idText.indexOf(idNeedle) !== -1);
                var looksButton = typeText.indexOf("button") !== -1 || classText.indexOf("button") !== -1 || onactivate.length > 0;
                var labelMatch = false;
                if (labelNeed) {
                    if (textText.indexOf(labelNeed) !== -1) {
                        labelMatch = true;
                    } else {
                        var cc = 0;
                        try { cc = panel.GetChildCount ? panel.GetChildCount() : 0; } catch (e2) { cc = 0; }
                        for (var ci = 0; ci < cc && !labelMatch; ci++) {
                            var child = null;
                            try { child = panel.GetChild(ci); } catch (e3) { child = null; }
                            var childText = (ReadPanelTextMaybe(child) || "").toLowerCase();
                            if (childText.indexOf(labelNeed) !== -1) labelMatch = true;
                        }
                    }
                }

                if (idMatch || (looksButton && (idContains || labelMatch))) {
                    return { panel: panel, scanned: scanned, roots: roots.length, source: "scan" };
                }

                var childCount = 0;
                try { childCount = panel.GetChildCount ? panel.GetChildCount() : 0; } catch (e4) { childCount = 0; }
                for (var c = 0; c < childCount; c++) {
                    var childPanel = null;
                    try { childPanel = panel.GetChild(c); } catch (e5) { childPanel = null; }
                    if (childPanel) stack.push(childPanel);
                }
            }
        }

        return { panel: null, scanned: scanned, roots: roots.length, source: "none" };
    }

    function PanelSubtreeContainsTextNeedle(panel, labelNeedle, maxPanels) {
        if (!panel) return false;
        var needle = labelNeedle ? String(labelNeedle).toLowerCase() : "";
        if (!needle) return true;
        var limit = Number(maxPanels);
        if (!isFinite(limit) || limit <= 0) limit = 80;
        var scanned = 0;
        var stack = [panel];
        while (stack.length > 0 && scanned < limit) {
            var cur = stack.pop();
            if (!cur) continue;
            scanned++;
            var text = (ReadPanelTextMaybe(cur) || "").toLowerCase();
            if (text.indexOf(needle) !== -1) return true;
            var childCount = 0;
            try { childCount = cur.GetChildCount ? cur.GetChildCount() : 0; } catch (e0) { childCount = 0; }
            for (var i = 0; i < childCount; i++) {
                var child = null;
                try { child = cur.GetChild(i); } catch (e1) { child = null; }
                if (child) stack.push(child);
            }
        }
        return false;
    }

    function FindBuildButtonPanelStrict(root, buttonId, labelNeedle) {
        var idNeedle = buttonId ? String(buttonId).toLowerCase() : "";
        if (!idNeedle) return { panel: null, scanned: 0, roots: 0, source: "none", labelMatched: false };
        var labelNeed = labelNeedle ? String(labelNeedle).toLowerCase() : "";
        var roots = CollectBuildUiSearchRoots(root);
        var scanned = 0;
        var fallbackIdOnly = null;

        for (var r = 0; r < roots.length; r++) {
            var base = roots[r];
            if (!base || !base.FindChildTraverse) continue;
            var direct = null;
            try { direct = base.FindChildTraverse(buttonId); } catch (e0) { direct = null; }
            if (!direct || !IsPanelValid(direct)) continue;
            var labelMatched = PanelSubtreeContainsTextNeedle(direct, labelNeed, 80);
            if (labelMatched) {
                return { panel: direct, scanned: scanned, roots: roots.length, source: "direct_strict", labelMatched: true };
            }
            if (!fallbackIdOnly) {
                fallbackIdOnly = { panel: direct, scanned: scanned, roots: roots.length, source: "direct_id_only", labelMatched: false };
            }
        }

        var maxPanels = 8000;
        for (var i = 0; i < roots.length && scanned < maxPanels; i++) {
            var rootPanel = roots[i];
            if (!rootPanel) continue;
            var stack = [rootPanel];
            while (stack.length > 0 && scanned < maxPanels) {
                var panel = stack.pop();
                if (!panel) continue;
                scanned++;
                var idText = (ReadPanelIdTextMaybe(panel) || "").toLowerCase();
                if (idText !== idNeedle) {
                    var childCount0 = 0;
                    try { childCount0 = panel.GetChildCount ? panel.GetChildCount() : 0; } catch (e2) { childCount0 = 0; }
                    for (var c0 = 0; c0 < childCount0; c0++) {
                        var child0 = null;
                        try { child0 = panel.GetChild(c0); } catch (e3) { child0 = null; }
                        if (child0) stack.push(child0);
                    }
                    continue;
                }

                var labelMatched0 = PanelSubtreeContainsTextNeedle(panel, labelNeed, 80);
                if (labelMatched0) {
                    return { panel: panel, scanned: scanned, roots: roots.length, source: "scan_strict", labelMatched: true };
                }
                if (!fallbackIdOnly) {
                    fallbackIdOnly = { panel: panel, scanned: scanned, roots: roots.length, source: "scan_id_only", labelMatched: false };
                }
            }
        }

        if (fallbackIdOnly) return fallbackIdOnly;
        return { panel: null, scanned: scanned, roots: roots.length, source: "none", labelMatched: false };
    }

    function FindCreateBuildButton(root) {
        return FindBuildButtonPanel(root, "CreateBuildButton", "create new build");
    }

    function FindCreateBuildButtonStrict(root) {
        return FindBuildButtonPanelStrict(root, "CreateBuildButton", "create new build");
    }

    function FindSaveBuildButtonStrict(root, selectedBuild) {
        var labelNeed = "save changes";
        var candidate = null;
        if (selectedBuild && selectedBuild.FindChildTraverse) {
            try { candidate = selectedBuild.FindChildTraverse("SaveBuildButton"); } catch (e0) { candidate = null; }
        }
        if (candidate && IsPanelValid(candidate)) {
            var labelMatched = PanelSubtreeContainsTextNeedle(candidate, labelNeed, 80);
            if (labelMatched) {
                return { panel: candidate, scanned: 0, roots: 1, source: "selected_build_direct_strict", labelMatched: true };
            }
            return { panel: candidate, scanned: 0, roots: 1, source: "selected_build_direct_id_only", labelMatched: false };
        }
        return FindBuildButtonPanelStrict(root, "SaveBuildButton", labelNeed);
    }

    function FindBrowseBuildsButton(root) {
        var strictUpper = FindBuildButtonPanelStrict(root, "BrowseBuildsButton", "browse builds");
        if (strictUpper && strictUpper.panel) return strictUpper;
        var strictLower = FindBuildButtonPanelStrict(root, "browseBuildsButton", "browsebuilds");
        if (strictLower && strictLower.panel) return strictLower;
        var scanUpper = FindBuildButtonPanel(root, "BrowseBuildsButton", "browse builds");
        if (scanUpper && scanUpper.panel) return scanUpper;
        var scanLower = FindBuildButtonPanel(root, "browseBuildsButton", "browsebuilds");
        if (scanLower && scanLower.panel) return scanLower;

        // Fallback for UI variants where id differs but the browse action text remains.
        return FindBuildButtonPanelByBrowseText(root);
    }

    function FindBuildButtonPanelByBrowseText(root) {
        var roots = CollectBuildUiSearchRoots(root);
        var scanned = 0;
        var maxPanels = 8000;
        var tokenA = "browsebuilds";
        var tokenB = "browse builds";
        var tokenC = "browse";
        var tokenD = "build";

        for (var r = 0; r < roots.length && scanned < maxPanels; r++) {
            var rootPanel = roots[r];
            if (!rootPanel) continue;
            var stack = [rootPanel];
            while (stack.length > 0 && scanned < maxPanels) {
                var panel = stack.pop();
                if (!panel) continue;
                scanned++;

                var idText = (ReadPanelIdTextMaybe(panel) || "").toLowerCase();
                var classText = (ReadPanelClassTextMaybe(panel) || "").toLowerCase();
                var typeText = (ReadPanelTypeTextMaybe(panel) || "").toLowerCase();
                var onactivate = "";
                try { onactivate = panel.GetAttributeString ? String(panel.GetAttributeString("onactivate", "") || "").toLowerCase() : ""; } catch (e0) { onactivate = ""; }
                var deepText = ReadPanelTextDeepLower(panel, 16);
                var combined = (idText + " " + classText + " " + deepText + " " + onactivate).toLowerCase();
                var looksButton = BuildUiPanelLooksButton(panel, onactivate, classText, typeText);
                var labelLike =
                    combined.indexOf(tokenA) !== -1 ||
                    combined.indexOf(tokenB) !== -1 ||
                    (combined.indexOf(tokenC) !== -1 && combined.indexOf(tokenD) !== -1);

                if (looksButton && labelLike) {
                    return { panel: panel, scanned: scanned, roots: roots.length, source: "scan_text_fallback" };
                }

                var childCount = 0;
                try { childCount = panel.GetChildCount ? panel.GetChildCount() : 0; } catch (e1) { childCount = 0; }
                for (var c = 0; c < childCount; c++) {
                    var child = null;
                    try { child = panel.GetChild(c); } catch (e2) { child = null; }
                    if (child) stack.push(child);
                }
            }
        }
        return { panel: null, scanned: scanned, roots: roots.length, source: "none" };
    }
    function IsBrowseBuildsPopupOpen(root) {
        if (!root || !root.FindChildTraverse) return false;
        var ids = ["PopupBuildBrowser", "BrowseBuilds", "HeroBuildSelector"];
        for (var i = 0; i < ids.length; i++) {
            var panel = null;
            try { panel = root.FindChildTraverse(ids[i]); } catch (e0) { panel = null; }
            if (panel && IsPanelValid(panel) && IsPanelVisibleMaybe(panel)) return true;
        }
        var cancelLookup = FindBrowseBuildsCancelButton(root);
        var cancelBtn = cancelLookup && cancelLookup.panel ? cancelLookup.panel : null;
        if (cancelBtn && IsPanelVisibleMaybe(cancelBtn)) return true;
        return false;
    }

    function FindBrowseBuildsCancelButton(root) {
        var roots = CollectBuildUiSearchRoots(root);
        var scanned = 0;
        var maxPanels = 9000;
        var popupTokens = ["popupbuildbrowser", "browsebuilds", "showmybuilds", "herobuildselector"];
        for (var i = 0; i < roots.length && scanned < maxPanels; i++) {
            var rootPanel = roots[i];
            if (!rootPanel) continue;
            var stack = [rootPanel];
            while (stack.length > 0 && scanned < maxPanels) {
                var panel = stack.pop();
                if (!panel) continue;
                scanned++;
                var idText = (ReadPanelIdTextMaybe(panel) || "").toLowerCase();
                var classText = (ReadPanelClassTextMaybe(panel) || "").toLowerCase();
                var typeText = (ReadPanelTypeTextMaybe(panel) || "").toLowerCase();
                var textText = (ReadPanelTextMaybe(panel) || "").toLowerCase();
                var onactivate = "";
                try { onactivate = panel.GetAttributeString ? String(panel.GetAttributeString("onactivate", "") || "").toLowerCase() : ""; } catch (e0) { onactivate = ""; }
                var looksButton = BuildUiPanelLooksButton(panel, onactivate, classText, typeText);
                if (looksButton) {
                    var childCancelText = "";
                    try {
                        var childCount0 = panel.GetChildCount ? panel.GetChildCount() : 0;
                        for (var c0 = 0; c0 < childCount0; c0++) {
                            var child0 = null;
                            try { child0 = panel.GetChild(c0); } catch (e1) { child0 = null; }
                            var childTxt = (ReadPanelTextMaybe(child0) || "").toLowerCase();
                            if (childTxt && childTxt.length > 0) {
                                childCancelText = childTxt;
                                if (childTxt === "cancel" || childTxt.indexOf("cancel") !== -1) break;
                            }
                        }
                    } catch(e2) { QOL_WARN("core", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
                    var combined = (idText + " " + classText + " " + textText + " " + onactivate + " " + childCancelText).toLowerCase();
                    var cancelLike =
                        textText === "cancel" ||
                        textText.indexOf("cancel") !== -1 ||
                        childCancelText === "cancel" ||
                        childCancelText.indexOf("cancel") !== -1 ||
                        combined.indexOf("secondarybutton") !== -1;
                    if (cancelLike && PanelChainContainsAnyToken(panel, popupTokens, 14)) {
                        return { panel: panel, source: "popup_scan", scanned: scanned, roots: roots.length };
                    }
                }
                var childCount = 0;
                try { childCount = panel.GetChildCount ? panel.GetChildCount() : 0; } catch (e3) { childCount = 0; }
                for (var c = 0; c < childCount; c++) {
                    var child = null;
                    try { child = panel.GetChild(c); } catch (e4) { child = null; }
                    if (child) stack.push(child);
                }
            }
        }
        return { panel: null, source: "none", scanned: scanned, roots: roots.length };
    }

    function PanelChainContainsAnyToken(panel, tokens, maxDepth) {
        if (!panel || !tokens || tokens.length === 0) return false;
        var depthLimit = Number(maxDepth);
        if (!isFinite(depthLimit) || depthLimit <= 0) depthLimit = 8;
        var walk = panel;
        var depth = 0;
        while (walk && depth < depthLimit) {
            var combined = (
                ReadPanelIdTextMaybe(walk) + " " +
                ReadPanelClassTextMaybe(walk) + " " +
                ReadPanelTypeTextMaybe(walk) + " " +
                ReadPanelTextMaybe(walk)
            ).toLowerCase();
            for (var i = 0; i < tokens.length; i++) {
                var token = tokens[i] ? String(tokens[i]).toLowerCase() : "";
                if (!token) continue;
                if (combined.indexOf(token) !== -1) return true;
            }
            try {
                walk = walk.GetParent ? walk.GetParent() : null;
            } catch (e0) {
                walk = null;
            }
            depth++;
        }
        return false;
    }

    function BuildUiPanelLooksButton(panel, onactivateText, classText, typeText) {
        if (!panel) return false;
        var cls = classText ? String(classText).toLowerCase() : "";
        var typ = typeText ? String(typeText).toLowerCase() : "";
        var onact = onactivateText ? String(onactivateText).toLowerCase() : "";
        return typ.indexOf("button") !== -1 || cls.indexOf("button") !== -1 || onact.length > 0;
    }

    function FindBuildDeleteButton(root) {
        var directIds = [
            "DeleteBuildButton",
            "DeleteHeroBuildButton",
            "RemoveBuildButton",
            "DeleteSelectedBuildButton",
            "ClearBuildButton"
        ];
        var roots = CollectBuildUiSearchRoots(root);
        for (var r = 0; r < roots.length; r++) {
            var base = roots[r];
            if (!base || !base.FindChildTraverse) continue;
            for (var d = 0; d < directIds.length; d++) {
                var direct = null;
                try { direct = base.FindChildTraverse(directIds[d]); } catch (e0) { direct = null; }
                if (direct && IsPanelValid(direct)) {
                    return { panel: direct, source: "direct:" + directIds[d], scanned: 0, roots: roots.length };
                }
            }
        }

        var deleteTokens = ["deletebuild", "delete_build", "deletehero", "removebuild", "remove_build", "clearbuild", "clear_build", "trash"];
        var skipTokens = ["deletecategory", "category", "quickbuy"];
        var scanned = 0;
        var maxPanels = 9500;
        for (var i = 0; i < roots.length && scanned < maxPanels; i++) {
            var rootPanel = roots[i];
            if (!rootPanel) continue;
            var stack = [rootPanel];
            while (stack.length > 0 && scanned < maxPanels) {
                var panel = stack.pop();
                if (!panel) continue;
                scanned++;
                var idText = (ReadPanelIdTextMaybe(panel) || "").toLowerCase();
                var classText = (ReadPanelClassTextMaybe(panel) || "").toLowerCase();
                var typeText = (ReadPanelTypeTextMaybe(panel) || "").toLowerCase();
                var textText = (ReadPanelTextMaybe(panel) || "").toLowerCase();
                var onactivate = "";
                try { onactivate = panel.GetAttributeString ? String(panel.GetAttributeString("onactivate", "") || "").toLowerCase() : ""; } catch (e1) { onactivate = ""; }
                var looksButton = BuildUiPanelLooksButton(panel, onactivate, classText, typeText);
                if (looksButton) {
                    var combined = idText + " " + classText + " " + textText + " " + onactivate;
                    var skip = false;
                    for (var s = 0; s < skipTokens.length; s++) {
                        if (combined.indexOf(skipTokens[s]) !== -1) {
                            skip = true;
                            break;
                        }
                    }
                    if (!skip) {
                        var hitDeleteToken = false;
                        for (var t = 0; t < deleteTokens.length; t++) {
                            if (combined.indexOf(deleteTokens[t]) !== -1) {
                                hitDeleteToken = true;
                                break;
                            }
                        }
                        var textLooksDeleteBuild =
                            (textText.indexOf("delete build") !== -1) ||
                            (textText.indexOf("remove build") !== -1) ||
                            (textText.indexOf("delete") !== -1 && (idText.indexOf("build") !== -1 || classText.indexOf("build") !== -1 || onactivate.indexOf("build") !== -1));
                        if (hitDeleteToken || textLooksDeleteBuild) {
                            return { panel: panel, source: "scan", scanned: scanned, roots: roots.length };
                        }
                    }
                }
                var childCount = 0;
                try { childCount = panel.GetChildCount ? panel.GetChildCount() : 0; } catch (e2) { childCount = 0; }
                for (var c = 0; c < childCount; c++) {
                    var childPanel = null;
                    try { childPanel = panel.GetChild(c); } catch (e3) { childPanel = null; }
                    if (childPanel) stack.push(childPanel);
                }
            }
        }
        return { panel: null, source: "none", scanned: scanned, roots: roots.length };
    }

    function FindBuildDeleteConfirmButton(root) {
        var roots = CollectBuildUiSearchRoots(root);
        var scanned = 0;
        var maxPanels = 9500;
        var popupTokens = ["popup", "dialog", "modal", "confirm"];
        for (var i = 0; i < roots.length && scanned < maxPanels; i++) {
            var rootPanel = roots[i];
            if (!rootPanel) continue;
            var stack = [rootPanel];
            while (stack.length > 0 && scanned < maxPanels) {
                var panel = stack.pop();
                if (!panel) continue;
                scanned++;
                var idText = (ReadPanelIdTextMaybe(panel) || "").toLowerCase();
                var classText = (ReadPanelClassTextMaybe(panel) || "").toLowerCase();
                var typeText = (ReadPanelTypeTextMaybe(panel) || "").toLowerCase();
                var textText = (ReadPanelTextMaybe(panel) || "").toLowerCase();
                var onactivate = "";
                try { onactivate = panel.GetAttributeString ? String(panel.GetAttributeString("onactivate", "") || "").toLowerCase() : ""; } catch (e0) { onactivate = ""; }
                var looksButton = BuildUiPanelLooksButton(panel, onactivate, classText, typeText);
                if (looksButton) {
                    var combined = idText + " " + classText + " " + textText + " " + onactivate;
                    // Some Deadlock confirms are PopupButton Button0 with child label "OK".
                    var childOkText = "";
                    try {
                        var cc = panel.GetChildCount ? panel.GetChildCount() : 0;
                        for (var ci = 0; ci < cc; ci++) {
                            var ch = null;
                            try { ch = panel.GetChild(ci); } catch (eChild) { ch = null; }
                            var childTxt = (ReadPanelTextMaybe(ch) || "").toLowerCase();
                            if (childTxt && childTxt.length > 0) {
                                childOkText = childTxt;
                                if (childTxt === "ok" || childTxt.indexOf("ok") !== -1) break;
                            }
                        }
                    } catch(eChildOuter) { QOL_WARN("core", "op failed: " + (eChildOuter && eChildOuter.message ? eChildOuter.message : String(eChildOuter || ""))); }
                    var isAutoConfirmPopupButton =
                        (idText === "button0") &&
                        (classText.indexOf("popupbutton") !== -1) &&
                        (classText.indexOf("isautoconfirm") !== -1 || childOkText === "ok" || childOkText.indexOf("ok") !== -1);
                    var likelyConfirm = (
                        textText === "delete" ||
                        textText === "confirm" ||
                        textText === "yes" ||
                        textText === "ok" ||
                        childOkText === "ok" ||
                        combined.indexOf("confirmbutton") !== -1 ||
                        combined.indexOf("acceptbutton") !== -1 ||
                        combined.indexOf("deleteconfirm") !== -1
                    );
                    if (
                        (isAutoConfirmPopupButton || likelyConfirm) &&
                        combined.indexOf("category") === -1 &&
                        (isAutoConfirmPopupButton || PanelChainContainsAnyToken(panel, popupTokens, 10))
                    ) {
                        return { panel: panel, source: "popup_scan", scanned: scanned, roots: roots.length };
                    }
                }
                var childCount = 0;
                try { childCount = panel.GetChildCount ? panel.GetChildCount() : 0; } catch (e1) { childCount = 0; }
                for (var c = 0; c < childCount; c++) {
                    var childPanel = null;
                    try { childPanel = panel.GetChild(c); } catch (e2) { childPanel = null; }
                    if (childPanel) stack.push(childPanel);
                }
            }
        }
        return { panel: null, source: "none", scanned: scanned, roots: roots.length };
    }

    function TryTriggerBuildDeleteAction(root) {
        var heroBuildItemsTotal = CountHeroBuildListItems(root, true);
        if (heroBuildItemsTotal === 0) {
            return { ok: false, mode: "", source: "no_build_items" };
        }

        var confirmLookup = FindBuildDeleteConfirmButton(root);
        var confirmPanel = confirmLookup && confirmLookup.panel ? confirmLookup.panel : null;
        if (confirmPanel && IsPanelVisibleMaybe(confirmPanel) && ActivatePanelSafe(confirmPanel)) {
            return { ok: true, mode: "confirm", source: confirmLookup.source };
        }

        var deleteLookup = FindBuildDeleteButton(root);
        var deletePanel = deleteLookup && deleteLookup.panel ? deleteLookup.panel : null;
        if (deletePanel && IsPanelVisibleMaybe(deletePanel) && ActivatePanelSafe(deletePanel)) {
            return { ok: true, mode: "delete", source: deleteLookup.source };
        }

        var hasVisibleDeleteUi = !!(
            (confirmPanel && IsPanelVisibleMaybe(confirmPanel)) ||
            (deletePanel && IsPanelVisibleMaybe(deletePanel))
        );
        if (!hasVisibleDeleteUi) {
            return { ok: false, mode: "", source: "no_visible_delete_ui" };
        }

        try {
            if (typeof CitadelHudHeroBuildsDeleteSelectedBuild === "function") {
                CitadelHudHeroBuildsDeleteSelectedBuild();
                return { ok: true, mode: "delete", source: "fn:CitadelHudHeroBuildsDeleteSelectedBuild" };
            }
        } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        try {
            if (typeof CitadelHudHeroBuildsDeleteBuild === "function") {
                CitadelHudHeroBuildsDeleteBuild();
                return { ok: true, mode: "delete", source: "fn:CitadelHudHeroBuildsDeleteBuild" };
            }
        } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        try {
            if (typeof CitadelHudHeroBuildsRemoveSelectedBuild === "function") {
                CitadelHudHeroBuildsRemoveSelectedBuild();
                return { ok: true, mode: "delete", source: "fn:CitadelHudHeroBuildsRemoveSelectedBuild" };
            }
        } catch(e2) { QOL_WARN("core", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
        try {
            if (typeof CitadelHudHeroBuildsRemoveBuild === "function") {
                CitadelHudHeroBuildsRemoveBuild();
                return { ok: true, mode: "delete", source: "fn:CitadelHudHeroBuildsRemoveBuild" };
            }
        } catch(e3) { QOL_WARN("core", "op failed: " + (e3 && e3.message ? e3.message : String(e3 || ""))); }

        var eventNames = [
            "CitadelHudHeroBuildsDeleteSelectedBuild",
            "CitadelHudHeroBuildsDeleteBuild",
            "CitadelHudHeroBuildsRemoveSelectedBuild",
            "CitadelHudHeroBuildsRemoveBuild"
        ];
        for (var j = 0; j < eventNames.length; j++) {
            try {
                $.DispatchEvent(eventNames[j]);
                return { ok: true, mode: "delete", source: "event:" + eventNames[j] };
            } catch(e4) { QOL_WARN("core", "op failed: " + (e4 && e4.message ? e4.message : String(e4 || ""))); }
        }

        return { ok: false, mode: "", source: "none" };
    }

    function TryDismissBuildDeletePopup(root) {
        // Intentionally conservative: avoid parent/child popup traversal in this
        // path because stale popup ancestry can crash native UI in some sessions.
        // Keep cleanup to existing close paths (shop/browse close + state reset).
        return false;
    }

    function StepCorruptRepairClearStorageBuilds(root, nowMs) {
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        if (!State.buildCategoryPayloadCorruptRepairActive) {
            return { state: "done", detail: "Corrupt-repair clear step not active.", waitMs: 0 };
        }
        var startedMs = Number(State.buildCategoryPayloadCorruptRepairStartedMs) || now;
        var shopOpenNow = IsHudClassActive(root, "gShopOpen");
        if ((now - startedMs) > BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_TIMEOUT_MS) {
            if (!shopOpenNow) {
                // Keep repair in clear phase until user-visible shop context is available.
                State.buildCategoryPayloadCorruptRepairStartedMs = now;
                State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
                return { state: "wait", detail: SETTINGS_LOADER_CORRUPT_PROMPT_DETAIL, waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS };
            }
            // Do not skip clear on timeout when shop is open; restart clear window and keep waiting.
            State.buildCategoryPayloadCorruptRepairStartedMs = now;
            State.buildCategoryPayloadCorruptRepairClearRetries = 0;
            State.buildCategoryPayloadCorruptRepairClearEmptyHits = 0;
            State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
            return { state: "wait", detail: "Corrupt-repair clear is taking longer than expected. Retrying clear steps.", waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS };
        }
        if (now < (Number(State.buildCategoryPayloadCorruptRepairClearNextMs) || 0)) {
            return { state: "wait", detail: "Waiting before next clear action.", waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS };
        }

        // Loader corruption clear should auto-drive shop/build UI (no user prompt path).
        // Do not invoke generic payload-source bootstrap here because it can click
        // Browse Builds repeatedly and stack extra browser layers.
        EnsureStorageHeroFavoritesHeaderVisible(root, now);
        if (!shopOpenNow) {
            if (QOL.shouldRunBuildCategoryPayloadUiAction(now, "buildCategoryPayloadShopOpenActionNextMs", BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS)) {
                TryOpenHeroShopForHeroProbe(root);
            }
            State.buildCategoryPayloadCorruptRepairBrowseReady = false;
            State.buildCategoryPayloadCorruptRepairClearEmptyHits = 0;
            // Count unresolved "shop still closed" loops, not command dispatch success.
            // Some open commands return true even when the shop never becomes visible.
            State.buildCategoryPayloadCorruptRepairClearRetries = (Number(State.buildCategoryPayloadCorruptRepairClearRetries) || 0) + 1;
            State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
            if ((Number(State.buildCategoryPayloadCorruptRepairClearRetries) || 0) >= BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_PROMPT_RETRIES) {
                return { state: "wait", detail: SETTINGS_LOADER_CORRUPT_PROMPT_DETAIL, waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS };
            }
            return { state: "wait", detail: "Opening shop/build list for corruption clear.", waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS };
        }
        if (!QOL.isBuildCategoryPayloadSourceReady(root)) {
            State.buildCategoryPayloadCorruptRepairClearRetries = (Number(State.buildCategoryPayloadCorruptRepairClearRetries) || 0) + 1;
            if (State.buildCategoryPayloadCorruptRepairClearRetries > BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_MAX_RETRIES) {
                State.buildCategoryPayloadCorruptRepairClearRetries = 0;
            }
            // Do not hard-block clear on payload-source readiness; empty-list and delete checks
            // below can still resolve safely in some shop contexts.
        } else {
            State.buildCategoryPayloadCorruptRepairClearRetries = 0;
        }

        // Require build-browser context before any delete action so we don't delete from
        // the loaded build view. Open BrowseBuilds first, then proceed.
        var selectedBuildPanel = root && root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD) : null;
        var browseEntryVisibleCount = CollectStorageBuildEntryPanels(root, false).length;
        var browseEntryCount = CollectStorageBuildEntryPanels(root, true).length;
        var heroBuildItemsVisible = CountHeroBuildListItems(root, false);
        var heroBuildItemsTotal = CountHeroBuildListItems(root, true);
        var browseLookupCurrent = FindBrowseBuildsButton(root);
        var browseBtnCurrent = browseLookupCurrent && browseLookupCurrent.panel ? browseLookupCurrent.panel : null;
        var browseButtonVisible = !!(browseBtnCurrent && IsPanelVisibleMaybe(browseBtnCurrent));
        var deleteLookupGate = FindBuildDeleteButton(root);
        var confirmLookupGate = FindBuildDeleteConfirmButton(root);
        var hasDeleteControlsGate =
            !!(
                (deleteLookupGate && deleteLookupGate.panel && IsPanelVisibleMaybe(deleteLookupGate.panel)) ||
                (confirmLookupGate && confirmLookupGate.panel && IsPanelVisibleMaybe(confirmLookupGate.panel))
            );
        if (!State.buildCategoryPayloadCorruptRepairBrowseReady) {
            var browseLookupGate = browseLookupCurrent;
            var browseBtnGate = browseBtnCurrent;
            var browsePopupOpenGate = IsBrowseBuildsPopupOpen(root);
            var browseGateActed = false;
            if (!browsePopupOpenGate && browseButtonVisible && QOL.shouldRunBuildCategoryPayloadUiAction(now, "buildCategoryPayloadBrowseActionNextMs", BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS)) {
                browseGateActed = ActivatePanelSafe(browseBtnGate);
            }
            var firstSelectGate = TrySelectFirstStorageBuildEntry(root, true);
            if (firstSelectGate && firstSelectGate.ok) {
                State.buildCategoryPayloadCorruptRepairBrowseReady = true;
                State.buildCategoryPayloadCorruptRepairLastDeleteTitle = "";
                State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 0;
                State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
                return {
                    state: "wait",
                    detail: "Build browser ready. Starting delete sequence.",
                    waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS
                };
            }
            var canAssumeBrowserOpen = false;
            if (browsePopupOpenGate) {
                canAssumeBrowserOpen = true;
            } else if (browseBtnGate) {
                canAssumeBrowserOpen = !IsPanelVisibleMaybe(browseBtnGate);
            } else {
                // If button isn't discoverable, require stronger signal before proceeding.
                canAssumeBrowserOpen = (browseEntryCount > 1) || IsStorageBuildListEmpty(root);
            }
            // Some shop layouts keep BrowseBuildsButton visible while delete controls are
            // already actionable. Treat delete-ready UI as valid clear context.
            if (canAssumeBrowserOpen || hasDeleteControlsGate || browseEntryCount > 0 || IsStorageBuildListEmpty(root)) {
                State.buildCategoryPayloadCorruptRepairBrowseReady = true;
                State.buildCategoryPayloadCorruptRepairLastDeleteTitle = "";
                State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 0;
                State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
                return {
                    state: "wait",
                    detail: hasDeleteControlsGate
                        ? "Build delete controls detected. Starting clear sequence."
                        : "Build browser ready. Starting delete sequence.",
                    waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS
                };
            }
            State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
            return {
                state: "wait",
                detail: browseGateActed
                    ? "Opening build browser for corruption clear."
                    : "Waiting for build browser before clearing builds.",
                waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS
            };
        }
        if (browseButtonVisible && !hasDeleteControlsGate && browseEntryVisibleCount < 1 && !IsStorageBuildListEmpty(root) && !IsBrowseBuildsPopupOpen(root)) {
            // Browser likely collapsed and we don't yet have actionable delete context.
            if (QOL.shouldRunBuildCategoryPayloadUiAction(now, "buildCategoryPayloadBrowseActionNextMs", BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS)) {
                ActivatePanelSafe(browseBtnCurrent);
            }
            State.buildCategoryPayloadCorruptRepairBrowseReady = false;
            State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
            return {
                state: "wait",
                detail: "Build browser closed. Re-opening for corruption clear.",
                waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS
            };
        }

        var selectedHeaderCount = QOL.countBuildCategoryHeaders(selectedBuildPanel);
        if (heroBuildItemsTotal === 0 && selectedHeaderCount <= 0) {
            var listEmptyHits = (Number(State.buildCategoryPayloadCorruptRepairClearEmptyHits) || 0) + 1;
            State.buildCategoryPayloadCorruptRepairClearEmptyHits = listEmptyHits;
            TryCloseBrowseBuildsPopupForLoader(root);
            if (listEmptyHits >= BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_EMPTY_CONFIRM_HITS) {
                State.buildCategoryPayloadCorruptRepairClearRetries = 0;
                State.buildCategoryPayloadCorruptRepairClearEmptyHits = 0;
                State.buildCategoryPayloadCorruptRepairLastDeleteTitle = "";
                State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 0;
                return { state: "done", detail: "HeroBuildList is empty. Stopping clear.", waitMs: 0 };
            }
            State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
            return {
                state: "wait",
                detail: "Confirming HeroBuildList is empty (" + String(listEmptyHits) + "/" + String(BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_EMPTY_CONFIRM_HITS) + ").",
                waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS
            };
        }
        if (browseEntryVisibleCount < 1 && selectedHeaderCount <= 0) {
            var visibleEmptyHits = (Number(State.buildCategoryPayloadCorruptRepairClearEmptyHits) || 0) + 1;
            State.buildCategoryPayloadCorruptRepairClearEmptyHits = visibleEmptyHits;
            TryCloseBrowseBuildsPopupForLoader(root);
            if (visibleEmptyHits >= BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_EMPTY_CONFIRM_HITS) {
                State.buildCategoryPayloadCorruptRepairClearRetries = 0;
                State.buildCategoryPayloadCorruptRepairClearEmptyHits = 0;
                State.buildCategoryPayloadCorruptRepairLastDeleteTitle = "";
                State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 0;
                return { state: "done", detail: "No visible Skyrunner builds remain. Stopping clear.", waitMs: 0 };
            }
            State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
            return {
                state: "wait",
                detail: "Confirming Skyrunner build list is empty (" + String(visibleEmptyHits) + "/" + String(BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_EMPTY_CONFIRM_HITS) + ").",
                waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS
            };
        }

        if (IsStorageBuildListEmpty(root)) {
            var emptyHits = (Number(State.buildCategoryPayloadCorruptRepairClearEmptyHits) || 0) + 1;
            State.buildCategoryPayloadCorruptRepairClearEmptyHits = emptyHits;
            if (emptyHits < BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_EMPTY_CONFIRM_HITS) {
                var firstBuildSelect = { ok: false };
                if (QOL.shouldRunBuildCategoryPayloadUiAction(now, "buildCategoryPayloadBrowseActionNextMs", BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS)) {
                    firstBuildSelect = TrySelectFirstStorageBuildEntry(root, true);
                }
                State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
                return {
                    state: "wait",
                    detail: (
                        ((firstBuildSelect && firstBuildSelect.ok))
                            ? "Verifying Skyrunner build list is empty; refreshing builds view (" + String(emptyHits) + "/" + String(BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_EMPTY_CONFIRM_HITS) + ")."
                            : "Verifying Skyrunner build list is empty (" + String(emptyHits) + "/" + String(BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_EMPTY_CONFIRM_HITS) + ")."
                    ),
                    waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS
                };
            }
            State.buildCategoryPayloadCorruptRepairClearRetries = 0;
            State.buildCategoryPayloadCorruptRepairClearEmptyHits = 0;
            State.buildCategoryPayloadCorruptRepairLastDeleteTitle = "";
            State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 0;
            return { state: "done", detail: "No Skyrunner builds detected. Skipping clear.", waitMs: 0 };
        }
        State.buildCategoryPayloadCorruptRepairClearEmptyHits = 0;

        var selectedBuildTitleNow = NormalizeBuildSaveTargetText(TryReadSelectedBuildTitleText(root, selectedBuildPanel));
        if (selectedBuildTitleNow.length > 0 && selectedBuildTitleNow !== (State.buildCategoryPayloadCorruptRepairLastDeleteTitle || "")) {
            State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 0;
        }
        if (
            selectedBuildTitleNow.length > 0 &&
            selectedBuildTitleNow === (State.buildCategoryPayloadCorruptRepairLastDeleteTitle || "") &&
            browseEntryCount > 1 &&
            (Number(State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits) || 0) >= BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_SAME_TITLE_LIMIT
        ) {
            var preReselect = TrySelectNextStorageBuildEntry(root, true);
            if (!preReselect || !preReselect.ok) {
                preReselect = TrySelectFirstStorageBuildEntry(root, true);
            }
            if (preReselect && preReselect.ok) {
                State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 0;
                State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
                return {
                    state: "wait",
                    detail: "Selecting next Skyrunner build to clear.",
                    waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS
                };
            }
        }
        if (heroBuildItemsVisible === 0 && heroBuildItemsTotal > 0 && selectedHeaderCount <= 0) {
            // List exists but nothing is visible/selectable yet; avoid blind delete calls.
            State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
            return {
                state: "wait",
                detail: "Waiting for visible HeroBuildList items before clearing.",
                waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS
            };
        }

        var deleteAttempt = TryTriggerBuildDeleteAction(root);
        if (deleteAttempt && deleteAttempt.ok) {
            State.buildCategoryPayloadCorruptRepairClearRetries = 0;
            State.buildCategoryPayloadCorruptRepairClearEmptyHits = 0;
            if (selectedBuildTitleNow.length > 0) {
                if (selectedBuildTitleNow === (State.buildCategoryPayloadCorruptRepairLastDeleteTitle || "")) {
                    State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = (Number(State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits) || 0) + 1;
                } else {
                    State.buildCategoryPayloadCorruptRepairLastDeleteTitle = selectedBuildTitleNow;
                    State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 1;
                }
            } else {
                State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 0;
            }
            var selectedHeaderCountNow = QOL.countBuildCategoryHeaders(selectedBuildPanel);
            if (
                (Number(State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits) || 0) >= (BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_SAME_TITLE_LIMIT + 6) &&
                browseEntryCount <= 1 &&
                selectedHeaderCountNow <= 0
            ) {
                State.buildCategoryPayloadCorruptRepairClearRetries = 0;
                State.buildCategoryPayloadCorruptRepairClearEmptyHits = 0;
                State.buildCategoryPayloadCorruptRepairLastDeleteTitle = "";
                State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 0;
                return { state: "done", detail: "Clear verification reached stable empty state.", waitMs: 0 };
            }
            if (
                (Number(State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits) || 0) >= (BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_SAME_TITLE_LIMIT + 8) &&
                browseEntryCount <= 1 &&
                selectedHeaderCountNow <= 1 &&
                selectedBuildTitleNow.indexOf("new hero_skyrunner build") !== -1
            ) {
                // Some contexts retain a terminal default build that won't delete via UI.
                // Stop clear looping here and continue bootstrap/save sequence.
                State.buildCategoryPayloadCorruptRepairClearRetries = 0;
                State.buildCategoryPayloadCorruptRepairClearEmptyHits = 0;
                State.buildCategoryPayloadCorruptRepairLastDeleteTitle = "";
                State.buildCategoryPayloadCorruptRepairSameTitleDeleteHits = 0;
                return { state: "done", detail: "Reached terminal single Skyrunner build. Continuing repair.", waitMs: 0 };
            }
            if (browseEntryCount > 1) {
                var reselectAfterDelete = TrySelectNextStorageBuildEntry(root, true);
                if (!reselectAfterDelete || !reselectAfterDelete.ok) {
                    reselectAfterDelete = TrySelectFirstStorageBuildEntry(root, true);
                }
                if (reselectAfterDelete && reselectAfterDelete.ok) {
                    State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
                    return {
                        state: "wait",
                        detail: "Selecting next Skyrunner build to clear.",
                        waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS
                    };
                }
            }
            State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_DELETE_SETTLE_MS;
            return {
                state: "wait",
                detail: "Clearing existing Skyrunner builds.",
                waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_DELETE_SETTLE_MS
            };
        }

        var reselect = TrySelectNextStorageBuildEntry(root, true);
        if (!reselect || !reselect.ok) {
            reselect = TrySelectFirstStorageBuildEntry(root, true);
        }
        if (reselect && reselect.ok) {
            State.buildCategoryPayloadCorruptRepairClearEmptyHits = 0;
            State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
            return {
                state: "wait",
                detail: "Selecting next Skyrunner build to clear.",
                waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS
            };
        }

        State.buildCategoryPayloadCorruptRepairClearRetries = (Number(State.buildCategoryPayloadCorruptRepairClearRetries) || 0) + 1;
        if (State.buildCategoryPayloadCorruptRepairClearRetries > BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_MAX_RETRIES) {
            State.buildCategoryPayloadCorruptRepairClearRetries = 0;
            State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
            return { state: "wait", detail: "Unable to clear builds yet. Keeping repair active and retrying.", waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS };
        }
        State.buildCategoryPayloadCorruptRepairClearNextMs = now + BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS;
        return {
            state: "wait",
            detail: "Waiting for delete controls while clearing Skyrunner builds.",
            waitMs: BUILD_CATEGORY_PAYLOAD_CORRUPT_CLEAR_STEP_MS
        };
    }

    function ReadPanelTextDeepMaybe(panel, maxPanels) {
        if (!panel) return "";
        var best = "";
        var direct = ReadPanelTextMaybe(panel);
        if (direct && direct.length > 0) {
            best = String(direct).replace(/\s+/g, " ").trim();
        }
        var stack = [panel];
        var scanned = 0;
        var limit = Number(maxPanels);
        if (!isFinite(limit) || limit <= 0) limit = 90;
        while (stack.length > 0 && scanned < limit) {
            var node = stack.pop();
            if (!node) continue;
            scanned++;
            if (node !== panel) {
                var txt = ReadPanelTextMaybe(node);
                if (txt && txt.length > 0) {
                    var normalized = String(txt).replace(/\s+/g, " ").trim();
                    if (normalized.length > best.length) best = normalized;
                }
            }
            var childCount = 0;
            try { childCount = node.GetChildCount ? node.GetChildCount() : 0; } catch (e0) { childCount = 0; }
            for (var i = 0; i < childCount; i++) {
                var child = null;
                try { child = node.GetChild(i); } catch (e1) { child = null; }
                if (child) stack.push(child);
            }
        }
        return best || "";
    }

    function TryReadSelectedBuildTitleText(root, selectedBuild) {
        var host = selectedBuild;
        if (!host && root && root.FindChildTraverse) {
            host = root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD);
        }
        if (!host || !host.FindChildrenWithClassTraverse) return "";
        var labels = host.FindChildrenWithClassTraverse("SelectedBuildName") || [];
        for (var i = 0; i < labels.length; i++) {
            var txt = ReadPanelTextDeepMaybe(labels[i], 24);
            if (txt && txt.length > 0) return txt;
        }
        return "";
    }

    function NormalizeBuildSaveTargetText(text) {
        if (text === undefined || text === null) return "";
        return String(text).replace(/\s+/g, " ").trim().toLowerCase();
    }

    function BuildSavePanelFallbackSig(panel) {
        if (!panel || !IsPanelValid(panel)) return "";
        var idText = ReadPanelIdTextMaybe(panel) || "-";
        var classText = ReadPanelClassTextMaybe(panel) || "-";
        var childCount = 0;
        try { childCount = panel.GetChildCount ? panel.GetChildCount() : 0; } catch (e0) { childCount = 0; }
        return idText + "|" + classText + "|" + String(childCount);
    }

    function BuildSaveComputeSelectionSig(root, selectedBuild) {
        if (!selectedBuild || !IsPanelValid(selectedBuild)) return "";
        var title = NormalizeBuildSaveTargetText(TryReadSelectedBuildTitleText(root, selectedBuild));
        if (title.length > 0) return "title:" + title;
        return "panel:" + BuildSavePanelFallbackSig(selectedBuild);
    }

    function CaptureBuildSaveTargetSelection(root, selectedBuild, nowMs) {
        if (!selectedBuild || !IsPanelValid(selectedBuild)) return false;
        var sig = BuildSaveComputeSelectionSig(root, selectedBuild);
        var title = NormalizeBuildSaveTargetText(TryReadSelectedBuildTitleText(root, selectedBuild));
        State.buildSaveTargetBuildPanel = selectedBuild;
        State.buildSaveTargetBuildSig = sig || "";
        State.buildSaveTargetBuildTitle = title || "";
        State.buildSaveTargetStableHits = 0;
        State.buildSaveTargetDriftRetries = 0;
        State.buildSaveTargetQuietUntilMs = 0;
        State.buildSaveCaptureStartedMs = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        return (State.buildSaveTargetBuildSig || "").length > 0;
    }

    function IsBuildSaveTargetSelectionMatch(root, selectedBuild) {
        if (!selectedBuild || !IsPanelValid(selectedBuild)) return false;
        var targetPanel = IsPanelValid(State.buildSaveTargetBuildPanel) ? State.buildSaveTargetBuildPanel : null;
        if (targetPanel && targetPanel === selectedBuild) return true;

        var targetTitle = State.buildSaveTargetBuildTitle ? String(State.buildSaveTargetBuildTitle) : "";
        if (targetTitle.length > 0) {
            var currentTitle = NormalizeBuildSaveTargetText(TryReadSelectedBuildTitleText(root, selectedBuild));
            if (currentTitle.length > 0 && currentTitle === targetTitle) return true;
        }

        var targetSig = State.buildSaveTargetBuildSig ? String(State.buildSaveTargetBuildSig) : "";
        if (targetSig.length > 0) {
            var currentSig = BuildSaveComputeSelectionSig(root, selectedBuild);
            if (currentSig === targetSig) return true;
        }
        return false;
    }

    function TryReselectBuildSaveTargetByTitle(root, targetTitleText) {
        if (!root || !root.FindChildTraverse) return { ok: false, reason: "no_root" };
        var selectedBuild = root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD);
        if (!selectedBuild || !IsPanelValid(selectedBuild) || !selectedBuild.FindChildrenWithClassTraverse) {
            return { ok: false, reason: "no_selected_build" };
        }
        var targetTitle = NormalizeBuildSaveTargetText(targetTitleText);
        if (!targetTitle || targetTitle.length === 0) {
            return { ok: false, reason: "no_target_title" };
        }
        var entries = selectedBuild.FindChildrenWithClassTraverse("FavoriteBuildEntryContainer") || [];
        if (!entries || entries.length < 1) {
            return { ok: false, reason: "entry_count:" + String(entries ? entries.length : 0) };
        }

        var bestPanel = null;
        var bestScore = -1;
        var bestIndex = -1;
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (!entry || !IsPanelValid(entry)) continue;
            var entryText = NormalizeBuildSaveTargetText(ReadPanelTextDeepMaybe(entry, 36));
            var score = -1;
            if (entryText === targetTitle) score = 100;
            else if (entryText.length > 0 && (entryText.indexOf(targetTitle) !== -1 || targetTitle.indexOf(entryText) !== -1)) score = 70;
            if (score > bestScore) {
                bestScore = score;
                bestPanel = entry;
                bestIndex = i;
            }
        }
        if (!bestPanel || bestScore < 0) {
            return { ok: false, reason: "target_not_found", entryCount: entries.length };
        }
        var activated = ActivatePanelSafe(bestPanel);
        return {
            ok: !!activated,
            reason: activated ? "activated" : "activate_failed",
            entryCount: entries.length,
            targetIndex: bestIndex
        };
    }

    function TrySelectFirstStorageBuildEntry(root, includeHiddenEntries) {
        if (!root || !root.FindChildTraverse) {
            return { ok: false, reason: "no_root" };
        }
        var includeHidden = (includeHiddenEntries === true);
        var entries = CollectStorageBuildEntryPanels(root, includeHidden);
        if ((!entries || entries.length < 1) && !includeHidden) {
            entries = CollectStorageBuildEntryPanels(root, true);
            includeHidden = true;
        }
        if (!entries || entries.length < 1) {
            return { ok: false, reason: "entry_count:" + String(entries ? entries.length : 0) };
        }
        var target = null;
        var targetIndex = -1;
        for (var i = 0; i < entries.length; i++) {
            if (entries[i] && IsPanelValid(entries[i]) && (includeHidden || IsPanelVisibleMaybe(entries[i]))) {
                target = entries[i];
                targetIndex = i;
                break;
            }
        }
        if (!target) {
            target = entries[0];
            targetIndex = 0;
        }
        if (!target || !IsPanelValid(target)) {
            return { ok: false, reason: "target_invalid", targetIndex: targetIndex, entryCount: entries.length };
        }
        var activated = ActivatePanelSafe(target);
        return {
            ok: !!activated,
            reason: activated ? "activated" : "activate_failed",
            targetIndex: targetIndex,
            entryCount: entries.length
        };
    }

    function TrySelectNextStorageBuildEntry(root, includeHiddenEntries) {
        if (!root || !root.FindChildTraverse) {
            return { ok: false, reason: "no_root" };
        }
        var selectedBuild = root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD);
        var includeHidden = (includeHiddenEntries === true);
        var entries = CollectStorageBuildEntryPanels(root, includeHidden);
        if ((!entries || entries.length < 2) && !includeHidden) {
            entries = CollectStorageBuildEntryPanels(root, true);
            includeHidden = true;
        }
        if (!entries || entries.length < 2) {
            return { ok: false, reason: "entry_count:" + String(entries ? entries.length : 0) };
        }

        var selectedTitleLower = String(TryReadSelectedBuildTitleText(root, selectedBuild) || "").toLowerCase();
        var currentIndex = -1;
        var currentReason = "none";
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (!entry || !IsPanelValid(entry)) continue;
            var classText = String(ReadPanelClassTextMaybe(entry) || "").toLowerCase();
            var idText = String(ReadPanelIdTextMaybe(entry) || "").toLowerCase();
            if (
                classText.indexOf("selected") !== -1 ||
                classText.indexOf("active") !== -1 ||
                classText.indexOf("focused") !== -1 ||
                idText.indexOf("selected") !== -1
            ) {
                currentIndex = i;
                currentReason = "class";
                break;
            }
        }
        if (currentIndex < 0 && selectedTitleLower.length > 0) {
            for (var j = 0; j < entries.length; j++) {
                var entryTextLower = String(ReadPanelTextDeepMaybe(entries[j], 36) || "").toLowerCase();
                if (entryTextLower.length > 0 && entryTextLower.indexOf(selectedTitleLower) !== -1) {
                    currentIndex = j;
                    currentReason = "title";
                    break;
                }
            }
        }

        // If current selection can't be identified, avoid targeting index 0 repeatedly.
        var targetIndex = currentIndex >= 0 ? (currentIndex + 1) : (entries.length > 1 ? 1 : 0);
        if (targetIndex >= entries.length) targetIndex = entries.length - 1;
        if (targetIndex === currentIndex && entries.length > 1) {
            targetIndex = currentIndex > 0 ? (currentIndex - 1) : 1;
        }
        if (targetIndex < 0 || targetIndex >= entries.length) {
            return { ok: false, reason: "bad_target", currentIndex: currentIndex, currentReason: currentReason, entryCount: entries.length };
        }

        var target = entries[targetIndex];
        if (!target || !IsPanelValid(target)) {
            return { ok: false, reason: "target_invalid", currentIndex: currentIndex, currentReason: currentReason, targetIndex: targetIndex, entryCount: entries.length };
        }
        var activated = ActivatePanelSafe(target);
        return {
            ok: !!activated,
            reason: activated ? "activated" : "activate_failed",
            currentIndex: currentIndex,
            currentReason: currentReason,
            targetIndex: targetIndex,
            entryCount: entries.length
        };
    }

    function IsStorageBuildListEmpty(root) {
        if (!root || !root.FindChildTraverse) return false;
        var selectedBuild = root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD);
        if (selectedBuild && IsPanelValid(selectedBuild)) {
            try {
                if (selectedBuild.BHasClass && selectedBuild.BHasClass("NoBuild")) {
                    $.Msg("[QOLLock][LANG] IsStorageBuildListEmpty: returning TRUE (NoBuild class)");
                    return true;
                }
            } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        }
        // Check actual build items FIRST — more reliable than create button
        // visibility (the create button is always visible in Deadlock's UI).
        var heroBuildItemsTotal = CountHeroBuildListItems(root, true);
        $.Msg("[QOLLock][LANG] IsStorageBuildListEmpty: heroBuildItemsTotal=" + String(heroBuildItemsTotal));
        if (heroBuildItemsTotal > 0) {
            $.Msg("[QOLLock][LANG] IsStorageBuildListEmpty: returning FALSE (heroBuildItemsTotal>0)");
            return false;
        }
        if (heroBuildItemsTotal === 0) {
            $.Msg("[QOLLock][LANG] IsStorageBuildListEmpty: returning TRUE (heroBuildItemsTotal=0)");
            return true;
        }
        var createLookupStrict = FindCreateBuildButtonStrict(root);
        var createBtnStrict = createLookupStrict && createLookupStrict.panel ? createLookupStrict.panel : null;
        if (createBtnStrict && IsPanelVisibleMaybe(createBtnStrict)) {
            $.Msg("[QOLLock][LANG] IsStorageBuildListEmpty: returning TRUE (createBtn visible)");
            return true;
        }
        if (CollectStorageBuildEntryPanels(root, true).length > 0) return false;
        if (!selectedBuild || !IsPanelValid(selectedBuild)) {
            var createLookupMissingSelected = FindCreateBuildButton(root);
            return !!(createLookupMissingSelected && createLookupMissingSelected.panel);
        }
        var headerCount = QOL.countBuildCategoryHeaders(selectedBuild);
        if (headerCount > 0) return false;
        var createLookup = FindCreateBuildButton(root);
        if (createLookup && createLookup.panel) return true;
        if (selectedBuild.FindChildrenWithClassTraverse) {
            var entries = selectedBuild.FindChildrenWithClassTraverse("FavoriteBuildEntryContainer") || [];
            if (entries.length === 0) return true;
        }
        return false;
    }

    function CollectStorageBuildEntryPanels(root, includeHidden) {
        var entries = [];
        var allowHidden = (includeHidden === true);
        function pushUnique(panel) {
            if (!panel || !IsPanelValid(panel)) return;
            if (!allowHidden && !IsPanelVisibleMaybe(panel)) return;
            PushUnique(entries, panel);
        }
        function addByClass(host, className) {
            if (!host || !className || !host.FindChildrenWithClassTraverse) return;
            var panels = [];
            try { panels = host.FindChildrenWithClassTraverse(className) || []; } catch (e0) { panels = []; }
            for (var i = 0; i < panels.length; i++) {
                pushUnique(panels[i]);
            }
        }

        var selectedBuild = root && root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD) : null;
        var roots = CollectBuildUiSearchRoots(root);
        var classNames = [
            "FavoriteBuildEntryContainer",
            "FavoriteBuildEntry",
            "BuildEntryContainer",
            "BuildEntry",
            "HeroBuildListItem",
            "HeroBuildEntry",
            "BuildListEntry"
        ];

        // Favor known selected-build host first, then wider build UI roots.
        if (selectedBuild && IsPanelValid(selectedBuild)) {
            for (var c0 = 0; c0 < classNames.length; c0++) {
                addByClass(selectedBuild, classNames[c0]);
            }
        }
        for (var r = 0; r < roots.length; r++) {
            var host = roots[r];
            if (!host || !IsPanelValid(host)) continue;
            for (var c = 0; c < classNames.length; c++) {
                addByClass(host, classNames[c]);
            }
        }

        if (entries.length > 0) return entries;

        // Last-resort structural scan for UI variants that use different class names.
        var scanned = 0;
        var maxPanels = 9500;
        for (var rr = 0; rr < roots.length && scanned < maxPanels; rr++) {
            var rootPanel = roots[rr];
            if (!rootPanel) continue;
            var stack = [rootPanel];
            while (stack.length > 0 && scanned < maxPanels) {
                var panel = stack.pop();
                if (!panel) continue;
                scanned++;
                var idText = (ReadPanelIdTextMaybe(panel) || "").toLowerCase();
                var classText = (ReadPanelClassTextMaybe(panel) || "").toLowerCase();
                var typeText = (ReadPanelTypeTextMaybe(panel) || "").toLowerCase();
                var onactivate = "";
                try { onactivate = panel.GetAttributeString ? String(panel.GetAttributeString("onactivate", "") || "").toLowerCase() : ""; } catch (e1) { onactivate = ""; }
                var deepText = ReadPanelTextDeepLower(panel, 24);
                var combined = (idText + " " + classText + " " + onactivate + " " + deepText).toLowerCase();
                var looksEntry =
                    (combined.indexOf("buildentry") !== -1 || combined.indexOf("favoritebuild") !== -1) &&
                    BuildUiPanelLooksButton(panel, onactivate, classText, typeText);
                if (looksEntry) pushUnique(panel);

                var childCount = 0;
                try { childCount = panel.GetChildCount ? panel.GetChildCount() : 0; } catch (e2) { childCount = 0; }
                for (var ci = 0; ci < childCount; ci++) {
                    var child = null;
                    try { child = panel.GetChild(ci); } catch (e3) { child = null; }
                    if (child) stack.push(child);
                }
            }
        }

        return entries;
    }

    function FindHeroBuildListPanel(root) {
        var roots = CollectBuildUiSearchRoots(root);
        for (var i = 0; i < roots.length; i++) {
            var host = roots[i];
            if (!host || !host.FindChildTraverse) continue;
            var panel = null;
            try { panel = host.FindChildTraverse("HeroBuildList"); } catch (e0) { panel = null; }
            if (panel && IsPanelValid(panel)) {
                $.Msg("[QOLLock][LANG] FindHeroBuildListPanel: FOUND at root " + String(i) + "/" + String(roots.length));
                return panel;
            }
        }
        $.Msg("[QOLLock][LANG] FindHeroBuildListPanel: NOT FOUND across " + String(roots.length) + " roots");
        return null;
    }

    function CountHeroBuildListItems(root, includeHidden) {
        var listPanel = FindHeroBuildListPanel(root);
        if (!listPanel || !IsPanelValid(listPanel) || !listPanel.FindChildrenWithClassTraverse) {
            $.Msg("[QOLLock][LANG] CountHeroBuildListItems: listPanel not found, returning -1");
            return -1;
        }
        var items = [];
        try { items = listPanel.FindChildrenWithClassTraverse("HeroBuildListItem") || []; } catch (e0) { items = []; }
        $.Msg("[QOLLock][LANG] CountHeroBuildListItems: found " + String(items.length) + " HeroBuildListItem(s)");
        if (!items || items.length < 1) return 0;
        if (includeHidden === true) return items.length;
        var visibleCount = 0;
        for (var i = 0; i < items.length; i++) {
            if (items[i] && IsPanelVisibleMaybe(items[i])) visibleCount++;
        }
        return visibleCount;
    }
    function TryTriggerCreateBuild(createBuildBtn) {
        var attempts = [];
        if (createBuildBtn && IsPanelValid(createBuildBtn)) {
            attempts.push("button");
            if (ActivatePanelSafe(createBuildBtn)) {
                return { ok: true, path: "button_activate" };
            }
        }

        var fnExists = (typeof CitadelHudHeroBuildsCreateNewBuild === "function");
        attempts.push("fn:" + (fnExists ? "1" : "0"));
        if (fnExists) {
            try {
                CitadelHudHeroBuildsCreateNewBuild();
                return { ok: true, path: "fn_create_new_build" };
            } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        }

        var eventNames = [
            "CitadelHudHeroBuildsCreateNewBuild",
            "CitadelHudHeroBuildsCreateBuild"
        ];
        for (var i = 0; i < eventNames.length; i++) {
            var ev = eventNames[i];
            try {
                $.DispatchEvent(ev);
                return { ok: true, path: "event:" + ev };
            } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        }

        return { ok: false, path: attempts.join(",") || "none" };
    }

    function TryReadSelectedHeroIncludingStorageFromCommandPanels(root) {
        if (!root) return "";
        var stack = [root];
        var scanned = 0;
        var bestHero = "";
        var bestScore = -999;

        while (stack.length > 0 && scanned < HERO_SELECT_COMMAND_SCAN_MAX_PANELS) {
            var panel = stack.pop();
            if (!panel) continue;
            scanned++;

            var onactivate = "";
            try { onactivate = panel.GetAttributeString ? String(panel.GetAttributeString("onactivate", "") || "") : ""; } catch (e0) { onactivate = ""; }
            var heroFromCmd = QOL.normalizeHeroId(ExtractHeroTokenFromText(onactivate));
            if (heroFromCmd) {
                var score = 0;
                if (PanelLooksSelected(panel)) score += 8;
                try {
                    var idText = panel.id ? String(panel.id).toLowerCase() : "";
                    if (idText.indexOf("selected") !== -1) score += 3;
                    if (idText.indexOf("hero") !== -1) score += 1;
                } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
                try {
                    if (panel.visible === true) score += 1;
                } catch(e2) { QOL_WARN("core", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
                if (score > bestScore) {
                    bestScore = score;
                    bestHero = heroFromCmd;
                }
            }

            var childCount = 0;
            try { childCount = panel.GetChildCount ? panel.GetChildCount() : 0; } catch (e3) { childCount = 0; }
            for (var i = 0; i < childCount; i++) {
                var child = null;
                try { child = panel.GetChild(i); } catch (e4) { child = null; }
                if (child) stack.push(child);
            }
        }

        if (bestHero && bestScore >= 4) return bestHero;
        return "";
    }

    function TryReadBuildSaveStorageHeroFromSettings() {
        // GameInterfaceAPI confirmed absent — hero detection via settings API unavailable.
        return { hero: "", source: "" };
    }

    function ResolveBuildSaveStorageHeroSignal(root) {
        var fromSetting = TryReadBuildSaveStorageHeroFromSettings();
        if (fromSetting.hero) return fromSetting;

        var fromCommands = QOL.normalizeHeroId(TryReadSelectedHeroIncludingStorageFromCommandPanels(root));
        if (fromCommands) {
            return { hero: fromCommands, source: "commands" };
        }

        if (root && root.FindChildTraverse) {
            var panelRoots = [];
            function addPanel(panel) {
                if (!panel) return;
                for (var pi = 0; pi < panelRoots.length; pi++) {
                    if (panelRoots[pi] === panel) return;
                }
                panelRoots.push(panel);
            }
            addPanel(root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD));
            addPanel(root.FindChildTraverse("CitadelHudHeroBuilds"));
            addPanel(root.FindChildTraverse("HeroBuildSelector"));
            for (var pr = 0; pr < panelRoots.length; pr++) {
                var probe = panelRoots[pr];
                if (!probe) continue;
                var fromPanel = QOL.normalizeHeroId(TryReadHeroFromPanelSubtree(probe, 320));
                if (fromPanel) {
                    var pid = ReadPanelIdTextMaybe(probe) || "-";
                    return { hero: fromPanel, source: "panel:" + pid };
                }
            }
        }

        return { hero: "", source: "none" };
    }

    function IsBuildSaveStorageRuntimeSourceStale(sourceName) {
        var src = sourceName ? String(sourceName) : "";
        if (!src || src.length === 0) return false;
        if (src.indexOf("runtime:") === 0) src = src.slice(8);
        if (src === "heroLogoSpotlight") return true;
        if (src === "abilityHudProgressClass") return true;
        if (src === "abilityHintPanel") return true;
        if (src === "panelTreeScan") return true;
        if (src === "uiRoot") return true;
        if (src === "hud") return true;
        if (src === "gameplayHud") return true;
        if (src === "topBar") return true;
        if (src === "healthAbilities") return true;
        if (src === "heroShop") return true;
        return false;
    }

    function HasBuildSaveStorageUiReady(root) {
        if (!root || !root.FindChildTraverse) return false;
        var selectedBuild = root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD);
        if (!selectedBuild || !selectedBuild.FindChildTraverse) return false;
        var saveBtn = selectedBuild.FindChildTraverse("SaveBuildButton");
        var editBtn = selectedBuild.FindChildTraverse("EditHeroBuildButton");
        var entry = QOL.getBuildSaveCategoryNameEntry(root);
        return !!(saveBtn && editBtn && entry);
    }

    function ResetPendingHeroRestoreState() {
        State.heroRestorePendingTarget = "";
        State.heroRestorePendingStartedMs = 0;
        State.heroRestorePendingNextMs = 0;
        State.heroRestorePendingRetries = 0;
        State.heroRestorePendingContext = "";
    }

    function ProcessPendingHeroRestore(nowMs) {
        var targetHero = QOL.normalizeHeroId(State.heroRestorePendingTarget);
        if (!targetHero) {
            ResetPendingHeroRestoreState();
            return;
        }
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        if (now < (State.heroRestorePendingNextMs || 0)) return;
        var elapsed = now - (Number(State.heroRestorePendingStartedMs) || now);
        if (elapsed >= HERO_RESTORE_BLIND_SUCCESS_MS) {
            HeroReturnDebugLog("restore resolved(blind) target=" + targetHero + " ctx=" + (State.heroRestorePendingContext || "-"));
            QueueShopPulseAfterHeroRestore(now);
            ResetPendingHeroRestoreState();
            return;
        }

        if (elapsed > HERO_RESTORE_MAX_WAIT_MS) {
            HeroReturnDebugLog("restore timeout target=" + targetHero + " ctx=" + (State.heroRestorePendingContext || "-"));
            QueueShopPulseAfterHeroRestore(now);
            ResetPendingHeroRestoreState();
            return;
        }

        HeroReturnDebugLogThrottled(
            "restore_wait|" + targetHero,
            "restore waiting target=" + targetHero + " retry=" + (Number(State.heroRestorePendingRetries) || 0) + " ctx=" + (State.heroRestorePendingContext || "-"),
            now
        );

        if ((Number(State.heroRestorePendingRetries) || 0) < HERO_RESTORE_MAX_RETRIES) {
            var retried = QOL.selectHeroForBuildSave(targetHero);
            State.heroRestorePendingRetries = (Number(State.heroRestorePendingRetries) || 0) + 1;
            State.heroRestorePendingNextMs = now + HERO_RESTORE_RETRY_DELAY_MS;
            return;
        }

        State.heroRestorePendingNextMs = now + HERO_RESTORE_RETRY_DELAY_MS;
    }

    function FinishBuildClearRequest(root, token, state, message) {
        var didSwitchToStorageHero = !!State.buildClearDidSwitchToStorageHero;
        var returnHero = QOL.normalizeHeroId(State.buildClearReturnHero) || QOL.getConfiguredDefaultHeroId(State.lastConfig);
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        if (didSwitchToStorageHero) {
            if (typeof QueueDelayedHeroRestore === "function") {
                QOL.queueDelayedHeroRestore(returnHero, "build_clear_finish", BUILD_SAVE_PRE_RESTORE_DELAY_SEC);
            } else {
                QOL.selectHeroForBuildSave(returnHero);
            }
        }
        if (CLEAR_SETTINGS_LOADER_ENABLED) {
            var detail = message ? String(message) : "";
            if (state === "success") {
                if (GetClearSettingsLoaderStepState("verify_clear") === "active") {
                    SetClearSettingsLoaderStepState("verify_clear", "done", "Storage build list is empty.");
                }
                FinalizeClearSettingsLoaderSession("success", "Clear complete.", nowMs, didSwitchToStorageHero);
            } else {
                FinalizeClearSettingsLoaderSession("failed", detail || "Clear failed.", nowMs, didSwitchToStorageHero);
            }
        }
        SetBuildClearStatus(root, state, message, token);
        ResetBuildClearRuntimeState();
    }

    function ActivatePanelSafe(panel) {
        if (!panel) return false;
        var activated = false;
        var attempts = [
            function() { $.DispatchEvent("Activated", panel, "mouse"); },
            function() { $.DispatchEvent("Activated", panel); },
            function() { $.DispatchEvent("Activated", panel, "keyboard"); },
            function() { $.DispatchEvent("Activated", "mouse"); },
            function() { $.DispatchEvent("Activated", "keyboard"); }
        ];
        for (var i = 0; i < attempts.length; i++) {
            try {
                attempts[i]();
                activated = true;
                break;
            } catch(e) { QOL_WARN("core", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
        }
        return activated;
    }

    function AdvanceBuildClearRequestStage(root, nowMs, requestToken) {
        if (State.buildClearLastTraceStage !== State.buildClearStage) {
            State.buildClearLastTraceStage = State.buildClearStage;
            _TLog("clear:AdvanceStage", (State.buildClearStage || "-"));
        }
        if (QOL.tryAdvanceStorageSwitchStage(root, nowMs, requestToken, {
            stageKey: "buildClearStage",
            nextActionKey: "buildClearNextActionMs",
            didSwitchFlagKey: "buildClearDidSwitchToStorageHero",
            setStatus: function(activeRoot, token) {
                SetBuildClearStatus(activeRoot, "pending", "switching_to_skyrunner", token);
            }
        })) {
            return;
        }

        if (QOL.tryAdvanceStorageSwitchSettleStage(nowMs, {
            stageKey: "buildClearStage",
            nextActionKey: "buildClearNextActionMs",
            nextStage: "await_user_shop_open",
            debugMessage: "post hero switch delay done; entering await_user_shop_open",
            onEnterNextStage: function(nowValue) {
                State.buildClearStorageConfirmStartedMs = nowValue;
                State.buildClearStorageConfirmRetries = 0;
                State.buildClearStorageSwitchRetries = 0;
            }
        })) {
            return;
        }

        if (State.buildClearStage === "await_user_shop_open") {
            var shopOpen = IsHudClassActive(root, "gShopOpen");
            var selectedBuildGate = root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD) : null;
            var gateReady = !!(shopOpen && selectedBuildGate);
            if (gateReady) {
                State.buildClearUserShopGateSatisfied = true;
                _TLog("clear:AdvanceStage", "await_user_shop_open → open_browse");
                State.buildClearStage = "open_browse";
                State.buildClearRetries = 0;
                State.buildClearNextActionMs = nowMs;
                return;
            }

            State.buildClearStorageConfirmRetries = (Number(State.buildClearStorageConfirmRetries) || 0) + 1;

            SetBuildClearStatus(root, "pending", "await_user_open_shop", requestToken);
            State.buildClearNextActionMs = nowMs + BUILD_CLEAR_STORAGE_CONFIRM_POLL_MS;
            return;
        }

        if (State.buildClearStage === "open_browse") {
            var browseLookup = FindBrowseBuildsButton(root);
            var browseBtn = browseLookup && browseLookup.panel ? browseLookup.panel : null;
            var browseOk = ActivatePanelSafe(browseBtn);
            _TLog("clear:AdvanceStage", "open_browse → clear_loop ok=" + (browseOk ? "1" : "0"));
            State.buildClearStage = "clear_loop";
            State.buildClearNextActionMs = nowMs + BUILD_CLEAR_STORAGE_CONFIRM_POLL_MS;
            if (!browseOk) {
                State.buildClearRetries += 1;
                if (State.buildClearRetries > BUILD_CLEAR_MAX_RETRIES) {
                    FinishBuildClearRequest(root, requestToken, "failed", "browse_unavailable");
                    return;
                }
            } else {
                State.buildClearRetries = 0;
            }
            SetBuildClearStatus(root, "pending", "opening_builds_list", requestToken);
            return;
        }

        if (State.buildClearStage === "reselect_after_delete") {
            if (IsStorageBuildListEmpty(root)) {
                State.buildClearStage = "clear_loop";
                State.buildClearNextActionMs = nowMs + BUILD_CLEAR_ACTION_DELAY_MS;
                SetBuildClearStatus(root, "pending", "verifying_clear", requestToken);
                return;
            }
            var reselect = TrySelectNextStorageBuildEntry(root);
            var reselectCurrent = (reselect.currentIndex === undefined || reselect.currentIndex === null) ? "-" : String(reselect.currentIndex);
            var reselectTarget = (reselect.targetIndex === undefined || reselect.targetIndex === null) ? "-" : String(reselect.targetIndex);
            var reselectCount = (reselect.entryCount === undefined || reselect.entryCount === null) ? "-" : String(reselect.entryCount);
            if (reselect.ok) {
                State.buildClearRetries = 0;
                State.buildClearStage = "clear_loop";
                State.buildClearNextActionMs = nowMs + BUILD_CLEAR_POST_SELECT_DELAY_MS;
                SetBuildClearStatus(root, "pending", "deleting_build", requestToken);
                return;
            }
            State.buildClearRetries += 1;
            State.buildClearStage = "clear_loop";
            State.buildClearNextActionMs = nowMs + BUILD_CLEAR_ACTION_DELAY_MS;
            SetBuildClearStatus(root, "pending", "deleting_build", requestToken);
            if (State.buildClearRetries > BUILD_CLEAR_MAX_RETRIES) {
                FinishBuildClearRequest(root, requestToken, "failed", "reselect_unavailable");
            }
            return;
        }

        if (State.buildClearStage === "clear_loop") {
            if (!State.buildClearUserShopGateSatisfied) {
                State.buildClearStage = "await_user_shop_open";
                State.buildClearNextActionMs = nowMs + BUILD_CLEAR_STORAGE_CONFIRM_POLL_MS;
                SetBuildClearStatus(root, "pending", "await_user_open_shop", requestToken);
                return;
            }

            var selectedBuild = root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD) : null;
            if (!selectedBuild) {
                State.buildClearRetries += 1;
                State.buildClearNextActionMs = nowMs + BUILD_CLEAR_ACTION_DELAY_MS;
                SetBuildClearStatus(root, "pending", "waiting_for_shop", requestToken);
                if (State.buildClearRetries > BUILD_CLEAR_MAX_RETRIES) {
                    FinishBuildClearRequest(root, requestToken, "failed", "shop_not_ready");
                }
                return;
            }

            if (IsStorageBuildListEmpty(root)) {
                State.buildClearEmptyConfirmHits += 1;
                SetBuildClearStatus(root, "pending", "verifying_clear", requestToken);
                if (State.buildClearEmptyConfirmHits >= BUILD_CLEAR_EMPTY_CONFIRM_HITS) {
                    _TLog("clear:AdvanceStage", "verify_clear done → success");
                    FinishBuildClearRequest(root, requestToken, "success", "cleared");
                    return;
                }
                State.buildClearNextActionMs = nowMs + BUILD_CLEAR_ACTION_DELAY_MS;
                return;
            }

            State.buildClearEmptyConfirmHits = 0;
            var deleteTrigger = TryTriggerBuildDeleteAction(root);
            if (deleteTrigger.ok) {
                if (deleteTrigger.mode !== "confirm") {
                    State.buildClearDeletedCount += 1;
                }
                State.buildClearRetries = 0;
                if (deleteTrigger.mode === "confirm") {
                    State.buildClearStage = "reselect_after_delete";
                    State.buildClearNextActionMs = nowMs + BUILD_CLEAR_ACTION_DELAY_MS;
                } else {
                    State.buildClearNextActionMs = nowMs + BUILD_CLEAR_POST_DELETE_DELAY_MS;
                }
                SetBuildClearStatus(
                    root,
                    "pending",
                    deleteTrigger.mode === "confirm" ? "confirming_delete" : "deleting_build",
                    requestToken
                );
                return;
            }

            State.buildClearRetries += 1;
            State.buildClearNextActionMs = nowMs + BUILD_CLEAR_ACTION_DELAY_MS;
            SetBuildClearStatus(root, "pending", "deleting_build", requestToken);
            if (State.buildClearRetries > BUILD_CLEAR_MAX_RETRIES) {
                FinishBuildClearRequest(root, requestToken, "failed", "delete_controls_unavailable");
            }
            return;
        }

        State.buildClearStage = "open_browse";
        State.buildClearNextActionMs = nowMs + BUILD_CLEAR_ACTION_DELAY_MS;
    }

    function TryHandleBuildClearUnavailableRoot(root, nowMs) {
        if (root && root.GetAttributeString) return false;
        if (CLEAR_SETTINGS_LOADER_ENABLED && State.clearSettingsLoaderSessionActive) {
            FinalizeClearSettingsLoaderSession("failed", "Clear context unavailable.", nowMs, false);
        }
        ResetBuildClearRuntimeState();
        return true;
    }

    function TryHandleBuildClearCorruptRepairGate(root) {
        if (!(State.settingsLoaderSessionActive && State.buildCategoryPayloadCorruptRepairActive)) return false;
        ResetBuildClearRequestAttributes(root);
        if (CLEAR_SETTINGS_LOADER_ENABLED) {
            ResetClearSettingsLoaderSession(true);
        }
        ResetBuildClearRuntimeState();
        return true;
    }

    function TryFinalizeBuildClearWhenNotPending(root, nowMs, configuredReturnHero, requestState, requestMessage) {
        if (requestState === "pending") return false;
        if (CLEAR_SETTINGS_LOADER_ENABLED && State.clearSettingsLoaderSessionActive) {
            var endCode = requestState === "success" ? "success" : "failed";
            var endDetail = requestMessage ? String(requestMessage) : (requestState === "success" ? "Clear complete." : "Clear ended.");
            var switchedForFinalize = !!State.buildClearDidSwitchToStorageHero;
            FinalizeClearSettingsLoaderSession(endCode, endDetail, nowMs, switchedForFinalize);
        }
        if (State.buildClearDidSwitchToStorageHero) {
            var pendingReturnHero = QOL.normalizeHeroId(State.buildClearReturnHero) || configuredReturnHero;
            if (typeof QueueDelayedHeroRestore === "function") {
                QOL.queueDelayedHeroRestore(pendingReturnHero, "build_clear_state_exit", BUILD_SAVE_PRE_RESTORE_DELAY_SEC);
            } else {
                QOL.selectHeroForBuildSave(pendingReturnHero);
            }
        }
        ResetBuildClearRuntimeState();
        return true;
    }

    function EnsureBuildClearRequestToken(root, nowMs) {
        var requestToken = root.GetAttributeString(BUILD_CLEAR_TOKEN_ATTR, "");
        if (!requestToken || requestToken.length === 0) {
            requestToken = String(nowMs);
            root.SetAttributeString(BUILD_CLEAR_TOKEN_ATTR, requestToken);
        }
        if (CLEAR_SETTINGS_LOADER_ENABLED) {
            BeginClearSettingsLoaderSession(requestToken, nowMs);
        }
        return requestToken;
    }
    function EnsureBuildClearRequestRuntimeInitialized(root, nowMs, requestToken, configuredReturnHero) {
        if (State.buildClearActiveToken === requestToken) return;
        var reuseLoaderSkyrunner = QOL.canReuseLoaderConfirmedSkyrunnerContext(root, nowMs);
        var reuseGateReady = false;
        if (reuseLoaderSkyrunner) {
            var reuseShopOpen = IsHudClassActive(root, "gShopOpen");
            var reuseSelectedBuild = root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD) : null;
            reuseGateReady = !!(reuseShopOpen && reuseSelectedBuild);
        }
        State.buildClearActiveToken = requestToken;
        State.buildClearStage = reuseLoaderSkyrunner
            ? (reuseGateReady ? "open_browse" : "await_user_shop_open")
            : "switch_to_storage";
        State.buildClearStartedMs = nowMs;
        State.buildClearNextActionMs = nowMs;
        State.buildClearRetries = 0;
        State.buildClearDeletedCount = 0;
        State.buildClearEmptyConfirmHits = 0;
        State.buildClearDidSwitchToStorageHero = false;
        State.buildClearReturnHero = configuredReturnHero;
        State.buildClearStorageHeroConfirmed = !!reuseLoaderSkyrunner;
        State.buildClearStorageHeroConfirmedSource = reuseLoaderSkyrunner ? "startup_loader_reuse" : "";
        State.buildClearStorageConfirmRetries = 0;
        State.buildClearStorageSwitchRetries = 0;
        State.buildClearStorageConfirmStartedMs = 0;
        State.buildClearUserShopGateSatisfied = !!reuseGateReady;
        SetBuildClearStatus(root, "pending", reuseLoaderSkyrunner ? "reuse_skyrunner_context" : "starting", requestToken);
    }

    function TickBuildClearRequestRuntime(root, nowMs, requestToken) {
        if (CLEAR_SETTINGS_LOADER_ENABLED) {
            UpdateClearSettingsLoaderFromBuildClearState(State.buildClearStage, root.GetAttributeString(BUILD_CLEAR_MSG_ATTR, ""));
        }
        if (nowMs < (State.buildClearNextActionMs || 0)) return;
        if (nowMs - (State.buildClearStartedMs || nowMs) > BUILD_CLEAR_TIMEOUT_MS) {
            FinishBuildClearRequest(root, requestToken, "failed", "timeout");
            return;
        }
        AdvanceBuildClearRequestStage(root, nowMs, requestToken);
    }

    function ProcessBuildRequestCommon(
        root,
        nowMs,
        cfg,
        tryHandleUnavailableFn,
        tryHandlePreGateFn,
        requestStateAttr,
        requestMessageAttr,
        tryFinalizeWhenNotPendingFn,
        ensureRequestTokenFn,
        resolvePayloadFn,
        ensureRuntimeInitializedFn,
        tickRuntimeFn
    ) {
        if (tryHandleUnavailableFn && tryHandleUnavailableFn(root, nowMs)) return;
        if (tryHandlePreGateFn && tryHandlePreGateFn(root, nowMs)) return;

        var configuredReturnHero = QOL.getConfiguredDefaultHeroId(cfg);
        var requestState = root.GetAttributeString(requestStateAttr, "");
        var requestMessage = root.GetAttributeString(requestMessageAttr, "");
        if (tryFinalizeWhenNotPendingFn && tryFinalizeWhenNotPendingFn(root, nowMs, configuredReturnHero, requestState, requestMessage)) return;

        var requestToken = ensureRequestTokenFn(root, nowMs);
        var payloadText = "";
        if (resolvePayloadFn) {
            payloadText = resolvePayloadFn(root, requestToken);
            if (!payloadText || payloadText.length === 0) return;
        }

        ensureRuntimeInitializedFn(root, nowMs, requestToken, configuredReturnHero, payloadText);
        tickRuntimeFn(root, nowMs, requestToken, payloadText);
    }

    function ProcessBuildClearRequest(root, nowMs, cfg) {
        ProcessBuildRequestCommon(
            root,
            nowMs,
            cfg,
            TryHandleBuildClearUnavailableRoot,
            TryHandleBuildClearCorruptRepairGate,
            BUILD_CLEAR_STATE_ATTR,
            BUILD_CLEAR_MSG_ATTR,
            TryFinalizeBuildClearWhenNotPending,
            EnsureBuildClearRequestToken,
            null,
            EnsureBuildClearRequestRuntimeInitialized,
            TickBuildClearRequestRuntime
        );
    }

    function ProcessBuildSaveRequest(root, nowMs, cfg) {
        ProcessBuildRequestCommon(
            root,
            nowMs,
            cfg,
            QOL.tryHandleBuildSaveUnavailableRoot,
            null,
            BUILD_SAVE_STATE_ATTR,
            BUILD_SAVE_MSG_ATTR,
            QOL.tryFinalizeBuildSaveWhenNotPending,
            QOL.ensureBuildSaveRequestToken,
            QOL.resolveBuildSavePayloadText,
            QOL.ensureBuildSaveRequestRuntimeInitialized,
            QOL.tickBuildSaveRequestRuntime
        );
    }

    function ProcessBuildRequestOrchestration(root, nowMs, cfg) {
        var perfSection = PerfStart();
        ProcessBuildSaveRequest(root, nowMs, cfg);
        PerfEnd("loop.build_save_request", perfSection);
        perfSection = PerfStart();
        ProcessBuildClearRequest(root, nowMs, cfg);
        PerfEnd("loop.build_clear_request", perfSection);
    }







    function GetKeyboardCachedPanels(cache, allBindingsBox, fieldName, className) {
        var list = cache[fieldName];
        if (!IsPanelListValid(list)) {
            list = allBindingsBox.FindChildrenWithClassTraverse(className) || [];
            cache[fieldName] = list;
        }
        return list;
    }

    function FindUnsecuredSoulsSource(root) {
        if (!root) return null;

        var goldContainer = root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_GOLD_AP_CONTAINER) : null;
        if (goldContainer && goldContainer.FindChildTraverse) {
            var fromGoldById = goldContainer.FindChildTraverse("hudDealthGoldLabel");
            if (IsPanelValid(fromGoldById)) return fromGoldById;

            var fromGoldByClass = goldContainer.FindChildrenWithClassTraverse ? (goldContainer.FindChildrenWithClassTraverse("death_penalty_gold") || []) : [];
            for (var i = 0; i < fromGoldByClass.length; i++) {
                if (IsPanelValid(fromGoldByClass[i])) return fromGoldByClass[i];
            }
        }

        var byId = root.FindChildTraverse ? root.FindChildTraverse("hudDealthGoldLabel") : null;
        if (IsPanelValid(byId)) return byId;

        var candidates = root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("death_penalty_gold") || []) : [];
        for (var j = 0; j < candidates.length; j++) {
            var candidate = candidates[j];
            if (!IsPanelValid(candidate)) continue;
            if (FindAncestorWithClass(candidate, "hudDeathGoldContainer")) return candidate;
        }
        for (var k = 0; k < candidates.length; k++) {
            if (IsPanelValid(candidates[k])) return candidates[k];
        }
        return null;
    }


    function ResetUnsecuredSoulsTracking() {
        State.unsecuredSouls.lastSouls = -1;
        State.unsecuredSouls.lastSampleMs = 0;
        State.unsecuredSouls.rateEma = 0;
        State.unsecuredSouls.rateLastUpdateMs = 0;
        State.unsecuredSouls.etaEndMs = 0;
    }

    function FindStatBonusesSourceByIds(root, candidateIds) {
        if (!root || !candidateIds || candidateIds.length === 0) return null;
        for (var i = 0; i < candidateIds.length; i++) {
            var id = candidateIds[i];
            if (!id || !root.FindChildTraverse) continue;
            var byId = root.FindChildTraverse(id);
            if (byId) return byId;
        }

        var containers = root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("statAttributeContainer") || []) : [];
        for (var c = 0; c < containers.length; c++) {
            var panel = containers[c];
            if (!panel || !panel.id) continue;
            for (var j = 0; j < candidateIds.length; j++) {
                if (panel.id === candidateIds[j]) return panel;
            }
        }
        return null;
    }

    function ExtractFirstNumericToken(text) {
        if (!text || typeof text !== "string") return "";
        var trimmed = text.trim();
        if (trimmed.length === 0) return "";
        var match = /([+\-]?\d+(?:\.\d+)?%?)/.exec(trimmed);
        return (match && match[1]) ? match[1] : "";
    }

    function ExtractStatDisplayText(sourcePanel) {
        if (!sourcePanel) return "";

        var idCandidates = ["AttributeLabel", "ScalingStatLabel", "Value", "StatValue"];
        for (var i = 0; i < idCandidates.length; i++) {
            var rawById = GetFirstPanelTextById(sourcePanel, idCandidates[i]);
            var tokenById = ExtractFirstNumericToken(rawById);
            if (tokenById) return tokenById;
        }

        var classCandidates = [
            "ModifiedValue",
            "AttributeValue",
            "StatValue",
            "Value",
            "Label"
        ];
        for (var j = 0; j < classCandidates.length; j++) {
            var rawByClass = GetFirstPanelTextByClass(sourcePanel, classCandidates[j]);
            var tokenByClass = ExtractFirstNumericToken(rawByClass);
            if (tokenByClass) return tokenByClass;
        }

        if (!sourcePanel.Children) return "";
        var queue = [sourcePanel];
        while (queue.length > 0) {
            var current = queue.shift();
            if (!current) continue;
            if (typeof current.text === "string") {
                var token = ExtractFirstNumericToken(current.text);
                if (token) return token;
            }
            var kids = current.Children ? current.Children() : [];
            for (var k = 0; k < kids.length; k++) queue.push(kids[k]);
        }
        return "";
    }

    function ResolveStatBonusesSource(root, cacheKey, candidateIds, nowMs) {
        var source = State.cachedPanels[cacheKey];
        if (IsPanelValid(source)) {
            return source;
        }

        var nextByKey = State.statBonuses.nextSourceSearchByKey || {};
        var nextSearchMs = Number(nextByKey[cacheKey] || 0);
        if (nowMs < nextSearchMs) {
            return null;
        }
        source = FindStatBonusesSourceByIds(root, candidateIds);
        nextByKey[cacheKey] = source ? 0 : (nowMs + STAT_BONUSES_SOURCE_SEARCH_MS);
        State.statBonuses.nextSourceSearchByKey = nextByKey;
        State.cachedPanels[cacheKey] = source || null;
        return source;
    }

    function NormalizeStatBonusKeyText(text) {
        if (text === undefined || text === null) return "";
        return String(text).toLowerCase().replace(/[^a-z0-9#]+/g, "");
    }

    function TextMatchesAnyStatBonusKey(text, keys) {
        var normalized = NormalizeStatBonusKeyText(text);
        if (!normalized || !keys || keys.length === 0) return false;
        for (var i = 0; i < keys.length; i++) {
            var key = NormalizeStatBonusKeyText(keys[i]);
            if (!key) continue;
            if (normalized.indexOf(key) !== -1) return true;
        }
        return false;
    }

    function TryExtractNumericTokenFromPanelTree(panel, maxNodes) {
        if (!panel || !panel.Children) return "";
        var queue = [panel];
        var visited = 0;
        var limit = Math.max(10, Number(maxNodes) || 120);
        while (queue.length > 0 && visited < limit) {
            var current = queue.shift();
            visited++;
            if (!current) continue;
            if (typeof current.text === "string") {
                var token = ExtractFirstNumericToken(current.text);
                if (token) return token;
            }
            var kids = current.Children ? current.Children() : [];
            for (var i = 0; i < kids.length; i++) queue.push(kids[i]);
        }
        return "";
    }

    function GetStatBreakdownRowsDebugSnapshot(container, maxRows) {
        if (!container || !container.Children) return "";
        var rows = container.Children() || [];
        var limit = Math.max(1, Math.min(Number(maxRows) || 8, rows.length));
        var out = [];
        for (var i = 0; i < limit; i++) {
            var row = rows[i];
            if (!row) continue;
            var name = GetFirstPanelTextByClass(row, "StatName");
            if (!name || name.length === 0) {
                name = (row.id && row.id.length > 0) ? ("#" + row.id) : "(unnamed)";
            }
            var valueText = GetFirstPanelTextByClass(row, "StatValue");
            var token = ExtractFirstNumericToken(valueText);
            if (!token) token = TryExtractNumericTokenFromPanelTree(row, 50);
            var value = token || (valueText ? String(valueText).trim() : "?");
            out.push(String(name).replace(/\s+/g, " ").trim() + "=" + value);
        }
        return out.join(" || ");
    }

    function IsLikelyStatBreakdownRow(panel) {
        if (!panel) return false;
        var statName = GetFirstPanelTextByClass(panel, "StatName");
        if (!statName || statName.length === 0) return false;
        var statValue = GetFirstPanelTextByClass(panel, "StatValue");
        if (statValue && statValue.length > 0) return true;
        var token = TryExtractNumericTokenFromPanelTree(panel, 40);
        return !!(token && token.length > 0);
    }

    function IsLikelyStatBreakdownContainer(panel) {
        if (!panel || !panel.Children) return false;
        var rows = panel.Children() || [];
        var matchedRows = 0;
        for (var i = 0; i < rows.length; i++) {
            if (IsLikelyStatBreakdownRow(rows[i])) {
                matchedRows++;
                if (matchedRows >= 2) return true;
            }
        }
        return false;
    }

    function FindAncestorLikelyStatBreakdownContainer(panel, maxDepth) {
        var current = panel;
        var depth = 0;
        var limit = Math.max(1, Number(maxDepth) || 8);
        while (current && depth < limit) {
            if (IsLikelyStatBreakdownContainer(current)) return current;
            current = current.GetParent ? current.GetParent() : null;
            depth++;
        }
        return null;
    }

    function ResolveStatBonusesTooltipBreakdownPanel(root) {
        var cached = GetCachedPanel("statBonusesTooltipBreakdown");
        if (IsPanelValid(cached)) return cached;

        if (!root) return null;
        var byId = root.FindChildTraverse ? root.FindChildTraverse(STAT_BONUSES_TOOLTIP_BREAKDOWN_ID) : null;
        if (byId && IsLikelyStatBreakdownContainer(byId)) {
            SetCachedPanel("statBonusesTooltipBreakdown", byId);
            return byId;
        }

        var subRows = root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("SubStatValue") || []) : [];
        for (var i = 0; i < subRows.length; i++) {
            var fromSub = FindAncestorLikelyStatBreakdownContainer(subRows[i], 6);
            if (fromSub) {
                SetCachedPanel("statBonusesTooltipBreakdown", fromSub);
                return fromSub;
            }
        }

        var mainRows = root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("MainStatValue") || []) : [];
        for (var j = 0; j < mainRows.length; j++) {
            var fromMain = FindAncestorLikelyStatBreakdownContainer(mainRows[j], 6);
            if (fromMain) {
                SetCachedPanel("statBonusesTooltipBreakdown", fromMain);
                return fromMain;
            }
        }

        var statNames = root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("StatName") || []) : [];
        for (var k = 0; k < statNames.length; k++) {
            var fromName = FindAncestorLikelyStatBreakdownContainer(statNames[k], 8);
            if (fromName) {
                SetCachedPanel("statBonusesTooltipBreakdown", fromName);
                return fromName;
            }
        }

        return null;
    }

    function ExtractGoldenStatuesValueFromBreakdownContainer(container) {
        if (!container || !container.Children) return "";

        var rows = container.Children();
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row) continue;
            var rowName = GetFirstPanelTextByClass(row, "StatName");
            if (!TextMatchesAnyStatBonusKey(rowName, STAT_BONUSES_GOLDEN_ROW_KEYS)) continue;
            var rowValue = GetFirstPanelTextByClass(row, "StatValue");
            var token = ExtractFirstNumericToken(rowValue);
            if (!token) token = TryExtractNumericTokenFromPanelTree(row, 60);
            if (token) return token;
        }

        var fallbackQueue = [container];
        while (fallbackQueue.length > 0) {
            var current = fallbackQueue.shift();
            if (!current) continue;
            if (typeof current.text === "string" && TextMatchesAnyStatBonusKey(current.text, STAT_BONUSES_GOLDEN_ROW_KEYS)) {
                var parent = current.GetParent ? current.GetParent() : null;
                if (parent && parent.Children) {
                    var siblings = parent.Children() || [];
                    for (var s = 0; s < siblings.length; s++) {
                        var sibling = siblings[s];
                        if (!sibling || sibling === current) continue;
                        var sibToken = TryExtractNumericTokenFromPanelTree(sibling, 40);
                        if (sibToken) return sibToken;
                    }
                }
            }
            var kids = current.Children ? current.Children() : [];
            for (var k = 0; k < kids.length; k++) fallbackQueue.push(kids[k]);
        }

        return "";
    }

    function GetStatBonusesKeyFromContainerId(containerId) {
        if (!containerId || containerId.length === 0) return "";
        if (STAT_BONUSES_FIRE_RATE_IDS.indexOf(containerId) !== -1) return "fireRate";
        if (STAT_BONUSES_ABILITY_COOLDOWN_IDS.indexOf(containerId) !== -1) return "abilityCooldown";
        if (STAT_BONUSES_SPIRIT_POWER_IDS.indexOf(containerId) !== -1) return "spiritPower";
        if (STAT_BONUSES_CLIP_SIZE_IDS.indexOf(containerId) !== -1) return "clipSize";
        if (STAT_BONUSES_WEAPON_DAMAGE_IDS.indexOf(containerId) !== -1) return "weaponDamage";
        if (STAT_BONUSES_MAX_HEALTH_IDS.indexOf(containerId) !== -1) return "maxHealth";
        return "";
    }

    function FindStatContainerIdFromPanel(panel) {
        var current = panel;
        while (current) {
            if (current.id && String(current.id).indexOf("StatContainer_") === 0) {
                return String(current.id);
            }
            current = current.GetParent ? current.GetParent() : null;
        }
        return "";
    }

    function NormalizeStatBonusNumericToken(token) {
        var parsed = ExtractFirstNumericToken(token || "");
        if (!parsed) return "";
        var normalized = String(parsed).trim();
        if (normalized.charAt(0) === "+") normalized = normalized.substring(1);
        return normalized;
    }

    function ParseSignedNumberToken(token) {
        if (!token) return null;
        var raw = String(token).trim();
        var match = raw.match(/^([+\-]?)(\d+(?:\.\d+)?)(%?)$/);
        if (!match) return null;
        var value = parseFloat(match[2]);
        if (!isFinite(value)) return null;
        if (match[1] === "-") value = -value;
        return {
            value: value,
            suffix: match[3] || "",
            raw: raw
        };
    }

    function FormatSignedNumberToken(value, suffix) {
        if (!isFinite(value)) return "";
        var absVal = Math.abs(value);
        var decimals = 2;
        if (absVal >= 100) decimals = 0;
        else if (absVal >= 10) decimals = 1;
        var rounded = value.toFixed(decimals).replace(/\.?0+$/, "");
        if (rounded === "-0") rounded = "0";
        return rounded + (suffix || "");
    }

    function DeriveGoldenStatuesValueFromSource(sourcePanel) {
        if (!sourcePanel) return "";
        var modifiedToken = ExtractFirstNumericToken(GetFirstPanelTextById(sourcePanel, "ModifiedLabel"));
        if (!modifiedToken) modifiedToken = ExtractStatDisplayText(sourcePanel);
        var baseToken = ExtractFirstNumericToken(GetFirstPanelTextById(sourcePanel, "BaseLabel"));
        var modsToken = ExtractFirstNumericToken(GetFirstPanelTextById(sourcePanel, "ValueFromModsLabel"));
        var scalingToken = ExtractFirstNumericToken(GetFirstPanelTextById(sourcePanel, "StatScalingLabel"));

        var modified = ParseSignedNumberToken(modifiedToken);
        var base = ParseSignedNumberToken(baseToken);
        if (!modified || !base) return "";

        var derived = modified.value - base.value;
        var mods = ParseSignedNumberToken(modsToken);
        var scaling = ParseSignedNumberToken(scalingToken);
        if (mods) derived -= mods.value;
        if (scaling) derived -= scaling.value;
        if (!isFinite(derived)) return "";
        if (Math.abs(derived) < 0.0001) derived = 0;

        var suffix = modified.suffix || (base ? base.suffix : "");
        return FormatSignedNumberToken(derived, suffix);
    }

    function ExtractTooltipTotalTokenFromBreakdownContainer(breakdown) {
        if (!breakdown) return "";
        var parent = breakdown.GetParent ? breakdown.GetParent() : null;
        if (parent && parent.FindChildrenWithClassTraverse) {
            var totalRows = parent.FindChildrenWithClassTraverse("TotalStatValue") || [];
            for (var i = 0; i < totalRows.length; i++) {
                var row = totalRows[i];
                if (!row) continue;
                var valueText = GetFirstPanelTextByClass(row, "StatValue");
                var token = NormalizeStatBonusNumericToken(valueText);
                if (token) return token;
            }
        }
        return "";
    }

    function ResolveStatKeyFromTotalToken(totalToken, sourceByKey) {
        if (!totalToken || !sourceByKey) return "";
        var keys = ["fireRate", "abilityCooldown", "spiritPower", "clipSize", "weaponDamage", "maxHealth"];
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var source = sourceByKey[key];
            if (!source) continue;
            var sourceToken = NormalizeStatBonusNumericToken(ExtractStatDisplayText(source));
            if (!sourceToken) continue;
            if (sourceToken === totalToken) return key;
        }
        return "";
    }

    function HarvestGoldenStatuesTooltipValue(root, nowMs, sourceByKey) {
        if (nowMs < (State.statBonuses.nextTooltipScanMs || 0)) return;

        var breakdown = ResolveStatBonusesTooltipBreakdownPanel(root);

        var nextScan = nowMs + STAT_BONUSES_TOOLTIP_SCAN_MS;
        if (!breakdown) {
            var statNameCount = root && root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("StatName") || []).length : 0;
            var subRowCount = root && root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("SubStatValue") || []).length : 0;
            StatBonusesDebugLogThrottled(
                "no_breakdown|" + String(statNameCount) + "|" + String(subRowCount),
                "breakdown missing: no usable stat breakdown panel (id=" + STAT_BONUSES_TOOLTIP_BREAKDOWN_ID +
                    ", statNames=" + statNameCount +
                    ", subRows=" + subRowCount + ")",
                nowMs
            );
            State.statBonuses.nextTooltipScanMs = nextScan;
            return;
        }

        var rowsSnapshot = GetStatBreakdownRowsDebugSnapshot(breakdown, 10);
        StatBonusesDebugLogThrottled(
            "breakdown_found|" + String(breakdown.id || "(noid)") + "|" + rowsSnapshot,
            "breakdown found id=" + String(breakdown.id || "(noid)") + " rows=[" + rowsSnapshot + "]",
            nowMs
        );
        var goldenToken = ExtractGoldenStatuesValueFromBreakdownContainer(breakdown);
        if (goldenToken) {
            var statContainerId = FindStatContainerIdFromPanel(breakdown);
            var hoveredId = "";
            if (!statContainerId && typeof $.GetHoveredPanel === "function") {
                var hovered = $.GetHoveredPanel();
                hoveredId = hovered ? String(hovered.id || "(noid)") : "";
                statContainerId = FindStatContainerIdFromPanel(hovered);
            }
            var statKey = GetStatBonusesKeyFromContainerId(statContainerId);
            var tooltipTotal = "";
            if (!statKey) {
                tooltipTotal = ExtractTooltipTotalTokenFromBreakdownContainer(breakdown);
                statKey = ResolveStatKeyFromTotalToken(tooltipTotal, sourceByKey);
            }
            if (statKey) {
                State.statBonuses.goldenValues[statKey] = goldenToken;
                StatBonusesDebugLogThrottled(
                    "mapped|" + statKey + "|" + goldenToken + "|" + statContainerId + "|" + tooltipTotal + "|" + rowsSnapshot,
                    "mapped golden=" + goldenToken +
                        " -> key=" + statKey +
                        " container=" + (statContainerId || "(none)") +
                        " hovered=" + (hoveredId || "(n/a)") +
                        " total=" + (tooltipTotal || "(none)") +
                        " rows=[" + rowsSnapshot + "]",
                    nowMs
                );
            } else {
                StatBonusesDebugLogThrottled(
                    "unmapped|" + goldenToken + "|" + statContainerId + "|" + tooltipTotal + "|" + rowsSnapshot,
                    "unmapped golden=" + goldenToken +
                        " container=" + (statContainerId || "(none)") +
                        " hovered=" + (hoveredId || "(n/a)") +
                        " total=" + (tooltipTotal || "(none)") +
                        " rows=[" + rowsSnapshot + "]",
                    nowMs
                );
            }
        } else {
            StatBonusesDebugLogThrottled(
                "no_golden|" + rowsSnapshot,
                "golden row not found in breakdown rows=[" + rowsSnapshot + "]",
                nowMs
            );
        }

        State.statBonuses.nextTooltipScanMs = nextScan;
    }

    function ResolveGoldenStatBonusesValue(statKey, sourcePanel) {
        var fromSource = "";
        if (sourcePanel && sourcePanel.FindChildTraverse) {
            var sourceBreakdown = sourcePanel.FindChildTraverse(STAT_BONUSES_TOOLTIP_BREAKDOWN_ID);
            if (sourceBreakdown) {
                fromSource = ExtractGoldenStatuesValueFromBreakdownContainer(sourceBreakdown);
            }
        }
        if (fromSource) {
            State.statBonuses.goldenValues[statKey] = fromSource;
            return fromSource;
        }

        var cached = State.statBonuses.goldenValues[statKey];
        if (cached && cached.length > 0) return cached;

        var derived = DeriveGoldenStatuesValueFromSource(sourcePanel);
        if (derived && derived.length > 0) {
            State.statBonuses.goldenValues[statKey] = derived;
            return derived;
        }
        return "--";
    }

    function IsStatBonusTokenZero(token) {
        if (!token || token === "--") return false;
        var raw = String(token).trim();
        var match = raw.match(/^([+\-]?)(\d+(?:\.\d+)?)(%?)$/);
        if (!match) return false;
        var value = parseFloat(match[2]);
        if (!isFinite(value)) return false;
        if (match[1] === "-") value = -value;
        return Math.abs(value) < 0.0001;
    }

    function NormalizeEnemyUltNameKey(text) {
        if (text === undefined || text === null) return "";
        var normalized = String(text || "");
        normalized = normalized.replace(/<[^>]*>/g, " ");
        normalized = normalized.toLowerCase();
        normalized = normalized.replace(/\s+/g, " ").trim();
        if (!normalized) return "";
        normalized = normalized.replace(/[\u200b\u200c\u200d\ufeff]/g, "");
        normalized = normalized.replace(/[ \t\r\n]+/g, "");
        normalized = normalized.replace(/[.,'"`~!@#$%^&*()+={}\[\]|\\:;<>/?_-]/g, "");
        return normalized;
    }

    function ReadEnemyUltOldNameText(unitStatusPanel) {
        if (!unitStatusPanel || !unitStatusPanel.FindChildTraverse) return "";
        var namePanel = unitStatusPanel.FindChildTraverse("name");
        if (!namePanel || !IsPanelValid(namePanel) || typeof namePanel.text !== "string") return "";
        return String(namePanel.text || "");
    }

    function ParseUltTrackedIndexFromText(rawText) {
        if (rawText === undefined || rawText === null) return -1;
        var text = String(rawText || "");
        if (!text || text.length === 0) return -1;
        var regexes = [
            /topbarplayer[_:-]?(\d{1,2})/i,
            /player[_:-]?(\d{1,2})/i,
            /playerslot[_:-]?(\d{1,2})/i,
            /playerid[_:-]?(\d{1,2})/i,
            /slot[_:-]?(\d{1,2})/i,
            /idx[_:-]?(\d{1,2})/i,
            /index[_:-]?(\d{1,2})/i
        ];
        for (var ri = 0; ri < regexes.length; ri++) {
            var m = regexes[ri].exec(text);
            if (!m || !m[1]) continue;
            var parsed = parseInt(m[1], 10);
            if (IsUltCooldownTrackedIndex(parsed)) return parsed;
        }
        return -1;
    }

    function TryReadUltTrackedIndexFromPanel(panel) {
        if (!panel) return -1;
        var index = ParseUltTrackedIndexFromText(ReadPanelIdTextMaybe(panel));
        if (IsUltCooldownTrackedIndex(index)) return index;
        index = ParseUltTrackedIndexFromText(ReadPanelClassTextMaybe(panel));
        if (IsUltCooldownTrackedIndex(index)) return index;
        index = ParseUltTrackedIndexFromText(ReadPanelTypeTextMaybe(panel));
        if (IsUltCooldownTrackedIndex(index)) return index;
        if (panel.GetAttributeString) {
            var attrKeys = [
                "player_slot",
                "playerslot",
                "player_slot_index",
                "player_index",
                "player_id",
                "index",
                "idx",
                "slot",
                "hero_index",
                "entityindex",
                "entindex",
                "id",
                "class",
                "style",
                "onactivate"
            ];
            for (var ai = 0; ai < attrKeys.length; ai++) {
                var attrVal = "";
                try { attrVal = String(panel.GetAttributeString(attrKeys[ai], "") || ""); } catch (eA0) { attrVal = ""; }
                if (!attrVal || attrVal.length === 0) continue;
                index = ParseUltTrackedIndexFromText(attrVal);
                if (IsUltCooldownTrackedIndex(index)) return index;
            }
        }
        return -1;
    }

    function ExtractEnemyUltIndexFromHints(unitStatusPanel, windowRoot, root) {
        var nodes = [unitStatusPanel, windowRoot];
        var current = unitStatusPanel;
        for (var ai = 0; ai < 5 && current; ai++) {
            current = current && current.GetParent ? current.GetParent() : null;
            if (current) nodes.push(current);
        }
        for (var ni = 0; ni < nodes.length; ni++) {
            var n = nodes[ni];
            if (!n) continue;
            var panelIndex = TryReadUltTrackedIndexFromPanel(n);
            if (IsUltCooldownTrackedIndex(panelIndex)) return panelIndex;
        }
        var namePanel = unitStatusPanel && unitStatusPanel.FindChildTraverse ? unitStatusPanel.FindChildTraverse("name") : null;
        var nameText = (namePanel && typeof namePanel.text === "string") ? String(namePanel.text || "") : "";
        var key = NormalizeEnemyUltNameKey(nameText);
        if (key && State.enemyUltOldTopBarNameToIndex && State.enemyUltOldTopBarNameToIndex.hasOwnProperty(key)) {
            var mapped = parseInt(State.enemyUltOldTopBarNameToIndex[key], 10);
            if (IsUltCooldownTrackedIndex(mapped)) return mapped;
        }
        return -1;
    }

    function CollectEnemyUltOldScanRoots(root) {
        var roots = [];
        function addRoot(panel, label) {
            if (!panel || !IsPanelValid(panel)) return;
            for (var i = 0; i < roots.length; i++) {
                if (roots[i] && roots[i].panel === panel) return;
            }
            roots.push({ panel: panel, label: label || "root" });
        }
        function addTopmostAncestor(panel, labelPrefix, maxDepth) {
            var cur = panel;
            var top = null;
            var topLabel = labelPrefix + "0";
            for (var d = 0; d < maxDepth && cur; d++) {
                try {
                    if (IsPanelValid(cur)) { top = cur; topLabel = labelPrefix + String(d); }
                    cur = cur.GetParent ? cur.GetParent() : null;
                } catch (e0) { cur = null; }
            }
            if (top) addRoot(top, topLabel);
        }
        var ctx = $.GetContextPanel ? $.GetContextPanel() : null;
        addTopmostAncestor(root, "root_", 5);
        addTopmostAncestor(GetGameplayHudPanel(root), "gameplay_", 4);
        addTopmostAncestor(ctx, "ctx_", 5);
        return roots;
    }

    function GetSharedUnitStatusOldPanels(root, nowMs, forceRefresh) {
        var cachedPanels = Array.isArray(State.enemyUnitStatusOldPanelCache) ? State.enemyUnitStatusOldPanelCache : [];
        if (!forceRefresh && State.enemyUnitStatusOldPanelCacheRoot === root && nowMs < (State.enemyUnitStatusOldPanelCacheNextMs || 0)) {
            return cachedPanels;
        }
        var roots = CollectEnemyUltOldScanRoots(root);
        var panels = [];
        var rootCounts = [];
        function pushPanel(panel) {
            if (!panel || !IsPanelValid(panel)) return;
            for (var i = 0; i < panels.length; i++) {
                if (panels[i] === panel) return;
            }
            panels.push(panel);
        }
        for (var ri = 0; ri < roots.length; ri++) {
            var scanRoot = roots[ri] && roots[ri].panel ? roots[ri].panel : null;
            if (!scanRoot || !scanRoot.FindChildrenWithClassTraverse) continue;
            var found = scanRoot.FindChildrenWithClassTraverse("UnitStatusOld") || [];
            for (var fi = 0; fi < found.length; fi++) pushPanel(found[fi]);
            var label = roots[ri] && roots[ri].label ? roots[ri].label : ("r" + String(ri));
            rootCounts.push(label + ":" + String(found.length));
        }
        EnemyUltOldDebugLogThrottled(
            "scanroots|" + rootCounts.join("|"),
            "scan_roots " + rootCounts.join(" "),
            nowMs
        );
        State.enemyUnitStatusOldPanelCacheRoot = root;
        State.enemyUnitStatusOldPanelCache = panels;
        State.enemyUnitStatusOldPanelCacheNextMs = nowMs + ENEMY_UNIT_STATUS_OLD_PANEL_SCAN_MS;
        State.enemyUnitStatusOldPanelScanStats = {
            roots: roots.length,
            panels: panels.length,
            rootCounts: rootCounts.join("|")
        };
        return panels;
    }

    function CollectUnitStatusOldPanelsForEnemyUlt(root, nowMs) {
        return GetSharedUnitStatusOldPanels(root, nowMs, false);
    }
    function IsEnemyColorWarningEnabled(cfg) {
        if (!cfg) return false;
        return IsColorWarningEnabled(cfg) ||
            IsCfgEnabled(cfg, "ENABLE_TOPBAR_ENEMY_HP_WARNING_75");
    }

    // Phase A.3: ResolveEnemyColoredHealthTeamClass + ResolveFriendlyTopBarTeamClass
    // removed — dead code (ql_feat_colorwarnings.js has its own copies).
    function IsAllyColorWarningEnabled(cfg) {
        if (!cfg) return false;
        return IsColorWarningEnabled(cfg) ||
            IsCfgEnabled(cfg, "ENABLE_TOPBAR_ALLY_HP_WARNING_75");
    }
    function GetCombatStatusProbeDelay(foundPanel, missKey, baseMs, maxMs) {
        var base = Number(baseMs);
        if (!isFinite(base) || base <= 0) base = COMBAT_STATUS_ALERT_PROBE_MS;
        var maxDelay = Number(maxMs);
        if (!isFinite(maxDelay) || maxDelay < base) maxDelay = base;
        if (foundPanel) {
            State[missKey] = 0;
            return base;
        }
        var misses = Math.min(6, (Number(State[missKey]) || 0) + 1);
        State[missKey] = misses;
        return Math.min(maxDelay, base * (1 + misses));
    }



    var COMBAT_INDICATOR_DEBUG = false;
    var COMBAT_INDICATOR_DEBUG_THROTTLE_MS = 700;
    var COMBAT_STATUS_ALERT_PROBE_MS = 500;
    var COMBAT_STATUS_PANEL_PROBE_IDLE_MAX_MS = 3000;
    var COMBAT_STATUS_RECOVERY_MS = 3000;

    function IsCombatSignalActive(root, nowMs) {
        if (!root) return false;
        var alertPanel = GetCachedPanel("combatStatusAlertPanel");
        if (!alertPanel && nowMs >= (State.combatStatus.nextAlertProbeMs || 0)) {
            alertPanel = root.FindChildTraverse ? root.FindChildTraverse("InCombatAlert") : null;
            SetCachedPanel("combatStatusAlertPanel", alertPanel);
            State.combatStatus.nextAlertProbeMs = nowMs + GetCombatStatusProbeDelay(
                !!alertPanel,
                "combatStatusAlertProbeMisses",
                COMBAT_STATUS_ALERT_PROBE_MS,
                COMBAT_STATUS_PANEL_PROBE_IDLE_MAX_MS
            );
        }
        if (IsPanelValid(alertPanel) && alertPanel.BHasClass && alertPanel.BHasClass("Visible")) {
            State.combatStatus.signalActive = true;
            return true;
        }
        try {
            if (root.BHasClass && (root.BHasClass("InCombat") || root.BHasClass("in_combat"))) {
                State.combatStatus.signalActive = true;
                return true;
            }
        } catch(eHudClass0) { QOL_WARN("core", "op failed: " + (eHudClass0 && eHudClass0.message ? eHudClass0.message : String(eHudClass0 || ""))); }
        return false;
    }

    function LogCombatIndicatorDebugState(root, cfg, nowMs, combatSignal, recoveryActive, classActive) {
        if (!COMBAT_INDICATOR_DEBUG) return;
        var rawEnabled = Number(cfg && cfg.ENABLE_COMBAT_INDICATOR);
        var enabled = rawEnabled === 1;
        var rootInCombat = !!(root && root.BHasClass && root.BHasClass(CLASS_IN_COMBAT));
        var rootInCombatAlt = !!(root && root.BHasClass && root.BHasClass("in_combat"));
        var rootOutCombat = !!(root && root.BHasClass && root.BHasClass(CLASS_OUT_OF_COMBAT));
        var hudInCombat = false;
        var hudInCombatAlt = false;
        try { hudInCombat = IsHudClassActive(root, CLASS_IN_COMBAT); } catch (e0) { hudInCombat = false; }
        try { hudInCombatAlt = IsHudClassActive(root, "in_combat"); } catch (e1) { hudInCombatAlt = false; }
        var regenImages = root && root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("regen_image") || []) : [];
        var regenValues = root && root.FindChildrenWithClassTraverse ? (root.FindChildrenWithClassTraverse("regen_value") || []) : [];
        var sampleImage = regenImages && regenImages.length > 0 ? regenImages[0] : null;
        var sampleValue = regenValues && regenValues.length > 0 ? regenValues[0] : null;
        var samplePath = sampleImage ? GetPanelDebugPath(sampleImage, 8) : "<none>";
        var sampleValuePath = sampleValue ? GetPanelDebugPath(sampleValue, 8) : "<none>";
        var sampleStyleFlags = sampleImage ? [
            hasClassInHierarchy(sampleImage, "colored_healthbar_active") ? "colored" : "",
            hasClassInHierarchy(sampleImage, "fg_healthbar_active") ? "fg" : "",
            hasClassInHierarchy(sampleImage, "minimalist_healthbar_active") ? "minimalist" : "",
            hasClassInHierarchy(sampleImage, "budhud_healthbar_active") ? "budhud" : "",
            hasClassInHierarchy(sampleImage, "klutz_healthbar_active") ? "klutz" : ""
        ].filter(function(v) { return !!v; }).join(",") : "";
        var sampleCombatFlags = sampleImage ? [
            hasClassInHierarchy(sampleImage, CLASS_IN_COMBAT) ? CLASS_IN_COMBAT : "",
            hasClassInHierarchy(sampleImage, "in_combat") ? "in_combat" : "",
            hasClassInHierarchy(sampleImage, "combat_indicator_active") ? "combat_indicator_active" : ""
        ].filter(function(v) { return !!v; }).join(",") : "";
        var sampleWashColor = "";
        var sampleValueColor = "";
        try { sampleWashColor = sampleImage && sampleImage.style ? String(sampleImage.style.washColor || "") : ""; } catch (e2) { sampleWashColor = "<err>"; }
        try { sampleValueColor = sampleValue && sampleValue.style ? String(sampleValue.style.color || "") : ""; } catch (e3) { sampleValueColor = "<err>"; }
        var sig = [
            isFinite(rawEnabled) ? String(rawEnabled) : "<nan>",
            combatSignal ? "1" : "0",
            recoveryActive ? "1" : "0",
            classActive ? "1" : "0",
            rootInCombat ? "1" : "0",
            rootInCombatAlt ? "1" : "0",
            hudInCombat ? "1" : "0",
            hudInCombatAlt ? "1" : "0",
            String(regenImages ? regenImages.length : 0),
            samplePath,
            sampleCombatFlags,
            sampleStyleFlags,
            sampleWashColor,
            sampleValueColor
        ].join("|");
        CombatIndicatorDebugLogThrottled(
            sig,
            "enabled=" + (enabled ? "1" : "0") +
            " rawEnabled=" + (isFinite(rawEnabled) ? String(rawEnabled) : "<nan>") +
            " signal=" + (combatSignal ? "1" : "0") +
            " recovery=" + (recoveryActive ? "1" : "0") +
            " classActive=" + (classActive ? "1" : "0") +
            " root[inCombat=" + (rootInCombat ? "1" : "0") +
            " in_combat=" + (rootInCombatAlt ? "1" : "0") +
            " out_of_combat=" + (rootOutCombat ? "1" : "0") + "]" +
            " hud[inCombat=" + (hudInCombat ? "1" : "0") +
            " in_combat=" + (hudInCombatAlt ? "1" : "0") + "]" +
            " regenImages=" + String(regenImages ? regenImages.length : 0) +
            " regenValues=" + String(regenValues ? regenValues.length : 0) +
            " samplePath=" + samplePath +
            " sampleValuePath=" + sampleValuePath +
            " sampleStyles=" + (sampleStyleFlags || "-") +
            " sampleCombatClasses=" + (sampleCombatFlags || "-") +
            " sampleWash=" + (sampleWashColor || "-") +
            " sampleColor=" + (sampleValueColor || "-"),
            nowMs
        );
    }
    function SyncCombatIndicatorHealthbarClasses(root, active, enabled) {
        if (!root || !root.FindChildTraverse) return;
        var panels = [];
        function pushPanel(panel) {
            if (!IsPanelValid(panel)) return;
            for (var i = 0; i < panels.length; i++) {
                if (panels[i] === panel) return;
            }
            panels.push(panel);
        }
        pushPanel(GetCachedPanel("healthContainer"));
        pushPanel(GetCachedPanel("gameplayHud"));
        pushPanel(root.FindChildTraverse(PANEL_ID_HEALTH_CONTAINER));
        pushPanel(root.FindChildTraverse("HealthBarContent"));
        pushPanel(root.FindChildTraverse("HealthRegenAndTotal"));
        pushPanel(root.FindChildTraverse("hud_health_bars"));
        for (var p = 0; p < panels.length; p++) {
            SetPanelClassIfChanged(panels[p], "combat_indicator_enabled", enabled);
            SetPanelClassIfChanged(panels[p], "combat_indicator_active", active);
        }
    }

    function FindFirstImageSrcInTree(panel) {
        if (!panel || !panel.Children) return "";
        var queue = [panel];
        while (queue.length > 0) {
            var current = queue.shift();
            if (!current) continue;
            if (current.GetAttributeString) {
                var src = current.GetAttributeString("src", "");
                if (src && src !== "none") return src;
                var def = current.GetAttributeString("defaultsrc", "");
                if (def && def !== "none") return def;
            }
            var bg = "";
            try {
                bg = (current.style && current.style.backgroundImage) ? String(current.style.backgroundImage) : "";
            } catch (e) {
                bg = "";
            }
            var fromBg = ExtractUrlFromBackgroundImage(bg);
            if (fromBg && fromBg !== "none") return fromBg;
            var kids = current.Children ? current.Children() : [];
            for (var i = 0; i < kids.length; i++) queue.push(kids[i]);
        }
        return "";
    }

    function ExtractUrlFromBackgroundImage(styleValue) {
        if (!styleValue) return "";
        var s = String(styleValue).trim();
        if (!s || s === "none") return "";
        // Panorama commonly stores image styles as: url("file://{images}/...")
        var match = s.match(/url\((['"]?)(.*?)\1\)/i);
        if (match && match[2]) {
            return String(match[2]).trim();
        }
        return "";
    }

    function GetImageSrc(panel) {
        if (!panel || !panel.GetAttributeString) return "";
        var src = panel.GetAttributeString("src", "");
        if (src && src !== "none") return src;
        var def = panel.GetAttributeString("defaultsrc", "");
        if (def && def !== "none") return def;
        var bg = "";
        try {
            bg = (panel.style && panel.style.backgroundImage) ? String(panel.style.backgroundImage) : "";
        } catch (e) {
            bg = "";
        }
        var fromBg = ExtractUrlFromBackgroundImage(bg);
        if (fromBg && fromBg !== "none") return fromBg;
        return "";
    }

    function NormalizeIconPath(path) {
        if (!path) return "";
        var s = String(path).trim().toLowerCase();
        if (s.indexOf("panorama:") === 0) s = s.substring(9);
        s = s.replace(/\\/g, "/");
        s = s.replace(/\s+/g, "");
        return s;
    }

    function ExtractImagePathTail(path) {
        var s = NormalizeIconPath(path);
        if (!s) return "";
        var idx = s.indexOf("{images}/");
        if (idx >= 0) return s.substring(idx);
        idx = s.indexOf("images/");
        if (idx >= 0) return s.substring(idx);
        return s;
    }

    function StripKnownImageExt(path) {
        if (!path) return "";
        return path.replace(/\.(psd|vtex|vsvg|png|jpg|jpeg)$/, "");
    }

    function IconSourceMatchesTarget(foundSrc, expectedSrc) {
        if (!expectedSrc || expectedSrc.length === 0) return true;
        var foundNorm = NormalizeIconPath(foundSrc);
        var expectedNorm = NormalizeIconPath(expectedSrc);
        if (!foundNorm || !expectedNorm) return false;
        if (foundNorm === expectedNorm) return true;

        var foundTail = ExtractImagePathTail(foundNorm);
        var expectedTail = ExtractImagePathTail(expectedNorm);
        if (!foundTail || !expectedTail) return false;
        if (foundTail === expectedTail) return true;
        if (foundTail.indexOf(expectedTail) !== -1 || expectedTail.indexOf(foundTail) !== -1) return true;

        var foundNoExt = StripKnownImageExt(foundTail);
        var expectedNoExt = StripKnownImageExt(expectedTail);
        if (foundNoExt === expectedNoExt) return true;
        return (foundNoExt.indexOf(expectedNoExt) !== -1 || expectedNoExt.indexOf(foundNoExt) !== -1);
    }

    function OwnerMatchesItemKind(ownerIcon, itemKind) {
        if (!itemKind || itemKind.length === 0) return true;
        if (!ownerIcon || !ownerIcon.BHasClass) return false;
        var kind = String(itemKind).toLowerCase();
        if (kind === "weapon") return ownerIcon.BHasClass("isWeapon");
        if (kind === "armor" || kind === "vitality") return ownerIcon.BHasClass("isArmor");
        if (kind === "tech" || kind === "spirit") return ownerIcon.BHasClass("isTech");
        return true;
    }

    function DetectOwnerTier(ownerIcon) {
        if (!ownerIcon || !ownerIcon.BHasClass) return null;

        // Prefer the highest tier class present on owner icon.
        for (var t = 4; t >= 1; t--) {
            if (ownerIcon.BHasClass("isTier" + String(t))) return t;
        }

        // Fallback: read explicit tier label classes if owner tier class is missing.
        var tierLabel = ownerIcon.FindChildTraverse ? ownerIcon.FindChildTraverse("mod_tier_label") : null;
        if (tierLabel && tierLabel.BHasClass) {
            for (var lt = 4; lt >= 1; lt--) {
                if (tierLabel.BHasClass("ModTierLevel" + String(lt))) return lt;
            }
        }

        return null;
    }

    function OwnerMatchesTier(ownerIcon, tier) {
        if (tier === undefined || tier === null || tier === "") return true;
        if (!ownerIcon || !ownerIcon.BHasClass) return false;
        var tierNum = parseInt(tier, 10);
        if (!isFinite(tierNum)) return true;
        if (tierNum < 1 || tierNum > 4) return true;
        var detected = DetectOwnerTier(ownerIcon);
        if (detected !== null) return detected === tierNum;
        return ownerIcon.BHasClass("isTier" + String(tierNum));
    }

    function OwnerMatchesExtraClass(ownerIcon, ownerClassName) {
        if (!ownerClassName || ownerClassName.length === 0) return true;
        if (!ownerIcon || !ownerIcon.BHasClass) return false;
        return ownerIcon.BHasClass(ownerClassName);
    }

    function OwnerMatchesCooldownCarrier(ownerIcon, requireCooldownCarrier) {
        if (!requireCooldownCarrier) return true;
        if (!ownerIcon || !ownerIcon.BHasClass) return false;
        var hasCooldownState = ownerIcon.BHasClass("OnCooldown") || ownerIcon.BHasClass("OffCooldown");
        if (!hasCooldownState) return false;
        var cooldownMask = ownerIcon.FindChildTraverse ? ownerIcon.FindChildTraverse("CooldownMask") : null;
        return !!cooldownMask;
    }

    function OwnerMatchesCooldownState(ownerIcon, requireCooldownState) {
        if (!requireCooldownState) return true;
        if (!ownerIcon || !ownerIcon.BHasClass) return false;
        return ownerIcon.BHasClass("OnCooldown") || ownerIcon.BHasClass("OffCooldown");
    }

    function OwnerMatchesUseType(ownerIcon, requirePassiveItem, requireActiveItem) {
        if (!ownerIcon || !ownerIcon.BHasClass) return false;
        if (requirePassiveItem && !ownerIcon.BHasClass("isPassiveItem")) return false;
        if (requireActiveItem && !ownerIcon.BHasClass("isActiveItem")) return false;
        return true;
    }

    function FindFirstExcludedModClassHit(iconContainer, excludedModClasses) {
        if (!iconContainer || !iconContainer.BHasClass) return "";
        if (!excludedModClasses || !excludedModClasses.length) return "";
        for (var i = 0; i < excludedModClasses.length; i++) {
            var cls = excludedModClasses[i];
            if (!cls) continue;
            if (iconContainer.BHasClass(String(cls))) return String(cls);
        }
        return "";
    }

    function EntryMatchesExcludedModClasses(iconContainer, excludedModClasses) {
        return FindFirstExcludedModClassHit(iconContainer, excludedModClasses).length === 0;
    }

    function ResolveTargetStyle(target) {
        if (target && target.style) {
            var explicitStyle = String(target.style).toLowerCase();
            if (explicitStyle === "offensive" || explicitStyle === "defensive") {
                return explicitStyle;
            }
        }
        var kind = target && target.itemKind ? String(target.itemKind).toLowerCase() : "";
        if (kind === "weapon" || kind === "tech" || kind === "spirit") {
            return "offensive";
        }
        return "defensive";
    }

    function IsOwnerActiveUse(ownerIcon) {
        if (!ownerIcon || !ownerIcon.BHasClass) return false;
        if (ownerIcon.BHasClass("isActiveItem")) return true;
        if (ownerIcon.BHasClass("isPassiveItem")) return false;
        return false;
    }

    function OwnerMatchesMirrorCategory(ownerIcon, target, cfg) {
        if (!cfg) return true;
        var style = ResolveTargetStyle(target);
        var isActiveUse = IsOwnerActiveUse(ownerIcon);
        var key = "";
        if (style === "offensive") {
            key = isActiveUse ? "ITEM_FILTER_OFF_ACTIVE" : "ITEM_FILTER_OFF_PASSIVE";
        } else {
            key = isActiveUse ? "ITEM_FILTER_DEF_ACTIVE" : "ITEM_FILTER_DEF_PASSIVE";
        }
        if (!cfg.hasOwnProperty(key)) return true;
        return Number(cfg[key]) === 1;
    }

    function CollectItemMirrorModsContainers(root) {
        var out = [];
        if (!root || !root.FindChildTraverse || !root.FindChildrenWithClassTraverse) {
            return out;
        }

        function PushUnique(panel) {
            if (!IsPanelValid(panel)) return;
            for (var i = 0; i < out.length; i++) {
                if (out[i] === panel) return;
            }
            out.push(panel);
        }

        function CollectFromSubtree(parent) {
            if (!IsPanelValid(parent) || !parent.FindChildrenWithClassTraverse) return;
            var found = parent.FindChildrenWithClassTraverse("ModsContainer") || [];
            for (var i = 0; i < found.length; i++) {
                PushUnique(found[i]);
            }
        }

        var focusedRoots = [
            "StatsAndModsContainer",
            "LowerLeft",
            "ModPurchasedPanelUniversal",
            "ModPurchasedPanelUniversalLocked"
        ];
        for (var fr = 0; fr < focusedRoots.length; fr++) {
            var subtree = root.FindChildTraverse(focusedRoots[fr]);
            if (!IsPanelValid(subtree)) continue;
            CollectFromSubtree(subtree);
        }

        if (out.length === 0) {
            CollectFromSubtree(root);
        }
        return out;
    }

    function BuildItemMirrorSourceIndex(root) {
        var modsContainers = CollectItemMirrorModsContainers(root);
        var entries = [];
        var scannedCount = 0;
        var seenOwnerIcons = [];
        var seenOwnerIds = [];
        for (var mc = 0; mc < modsContainers.length; mc++) {
            var modsContainer = modsContainers[mc];
            if (!modsContainer) continue;
            var nestedIcons = modsContainer.FindChildrenWithClassTraverse("mod_icon_single_container") || [];
            for (var ni = 0; ni < nestedIcons.length; ni++) {
                var nested = nestedIcons[ni];
                if (!nested || nested.id !== "modIconContainer") continue;
                scannedCount++;

                var ownerIcon = FindItemOwnerFromContainer(nested);
                if (!ownerIcon || !ownerIcon.BHasClass || !ownerIcon.BHasClass("hasAbility")) continue;

                var ownerId = ownerIcon.id ? ownerIcon.id : "unknown";

                // Dedup: skip entries for the same owner icon (same item appearing
                // under multiple ModsContainers, e.g. Universal + Locked Universal panels).
                // Check by both panel identity AND ownerId string, since different
                // ModsContainers may produce distinct panel instances for the same item.
                var isDuplicateOwner = false;
                for (var si = 0; si < seenOwnerIcons.length; si++) {
                    if (seenOwnerIcons[si] === ownerIcon) { isDuplicateOwner = true; break; }
                }
                if (!isDuplicateOwner) {
                    for (var sj = 0; sj < seenOwnerIds.length; sj++) {
                        if (seenOwnerIds[sj] === ownerId) { isDuplicateOwner = true; break; }
                    }
                }
                if (isDuplicateOwner) continue;
                seenOwnerIcons.push(ownerIcon);
                seenOwnerIds.push(ownerId);
                var cooldownState = ownerIcon.BHasClass("OffCooldown") ? "off" : "on";
                var sourceImage = nested.FindChildTraverse ? nested.FindChildTraverse("ModIconImage") : null;
                if (!sourceImage && ownerIcon.FindChildTraverse) sourceImage = ownerIcon.FindChildTraverse("ModIconImage");
                var cooldownMask = ownerIcon.FindChildTraverse ? ownerIcon.FindChildTraverse("CooldownMask") : null;
                var iconSrc = GetImageSrc(sourceImage) || FindFirstImageSrcInTree(nested) || FindFirstImageSrcInTree(ownerIcon);
                if (ITEM_MIRROR_EXPRESS_DEBUG &&
                    ownerIcon.BHasClass("isWeapon") &&
                    ownerIcon.BHasClass("isPassiveItem") &&
                    OwnerMatchesTier(ownerIcon, 3)) {
                    var rawSrc = (sourceImage && sourceImage.GetAttributeString) ? sourceImage.GetAttributeString("src", "") : "";
                    var rawDefaultSrc = (sourceImage && sourceImage.GetAttributeString) ? sourceImage.GetAttributeString("defaultsrc", "") : "";
                    var exclusionHit = FindFirstExcludedModClassHit(nested, EXPRESS_SHOT_EXCLUDED_MOD_CLASSES);
                    ExpressShotLog(
                        "candidate ownerId=" + ownerId +
                        " state=" + cooldownState +
                        " hasAbility=" + (ownerIcon.BHasClass("hasAbility") ? "1" : "0") +
                        " src=" + iconSrc +
                        " rawSrc=" + rawSrc +
                        " rawDefaultSrc=" + rawDefaultSrc +
                        " exclusionHit=" + (exclusionHit.length > 0 ? exclusionHit : "none")
                    );
                }

                entries.push({
                    ownerIcon: ownerIcon,
                    iconContainer: nested,
                    ownerId: ownerId,
                    cooldownState: cooldownState,
                    iconSrc: iconSrc,
                    sourceImage: sourceImage,
                    cooldownMask: cooldownMask
                });
            }
        }
        return {
            modsContainersCount: modsContainers.length,
            scannedCount: scannedCount,
            entries: entries
        };
    }

    function SourceEntryMatchesTarget(entry, target, cfg) {
        if (!entry || !target) return false;
        var isExpressTarget = (target.className === "expressShot");
        var itemClassName = target.className || "";
        var modClassName = target.modClassName || itemClassName;
        var skipClassMatch = !!target.skipClassMatch;
        var skipIconMatch = !!target.skipIconMatch;
        if (!skipClassMatch && (!itemClassName || !modClassName)) return false;

        var ownerIcon = entry.ownerIcon;
        var iconContainer = entry.iconContainer;
        var ownerClassName = target.ownerClassName ? target.ownerClassName : ((!skipClassMatch && target.modClassName) ? itemClassName : "");
        var requireModClass = target.requireModClass ? String(target.requireModClass) : "";
        var requireCooldownCarrier = !!target.requireCooldownCarrier;
        var requireCooldownState = !!target.requireCooldownState;
        var requirePassiveItem = !!target.requirePassiveItem;
        var requireActiveItem = !!target.requireActiveItem;
        var excludedModClasses = target.excludedModClasses || null;
        var itemKind = target.itemKind || "";
        var itemTier = (target.tier === undefined) ? null : target.tier;

        if (!iconContainer || !iconContainer.BHasClass) {
            if (isExpressTarget) ExpressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=no_icon_container");
            return false;
        }
        if (requireModClass.length > 0 && !iconContainer.BHasClass(requireModClass)) return false;
        if (skipClassMatch) {
            if (!skipIconMatch) {
                if (!IconSourceMatchesTarget(entry.iconSrc, target.iconSrc)) {
                    if (isExpressTarget) {
                        ExpressShotLog(
                            "reject ownerId=" + String(entry.ownerId || "") +
                            " reason=icon_mismatch expected=" + String(target.iconSrc || "") +
                            " got=" + String(entry.iconSrc || "")
                        );
                    }
                    return false;
                }
            }
        } else {
            if (!iconContainer.BHasClass(modClassName)) {
                if (isExpressTarget) ExpressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=class_mismatch expectedClass=" + String(modClassName || ""));
                return false;
            }
        }
        if (!EntryMatchesExcludedModClasses(iconContainer, excludedModClasses)) {
            if (isExpressTarget) {
                var excludedHit = FindFirstExcludedModClassHit(iconContainer, excludedModClasses);
                ExpressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=excluded_mod_class class=" + String(excludedHit || ""));
            }
            return false;
        }
        if (!ownerIcon || !ownerIcon.BHasClass || !ownerIcon.BHasClass("hasAbility")) {
            if (isExpressTarget) ExpressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=missing_hasAbility");
            return false;
        }
        if (!OwnerMatchesExtraClass(ownerIcon, ownerClassName)) {
            if (isExpressTarget) ExpressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=owner_class_mismatch expectedOwnerClass=" + String(ownerClassName || ""));
            return false;
        }
        if (!OwnerMatchesCooldownCarrier(ownerIcon, requireCooldownCarrier)) {
            if (isExpressTarget) ExpressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=cooldown_carrier_missing");
            return false;
        }
        if (!OwnerMatchesCooldownState(ownerIcon, requireCooldownState)) {
            if (isExpressTarget) ExpressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=cooldown_state_missing");
            return false;
        }
        if (!OwnerMatchesUseType(ownerIcon, requirePassiveItem, requireActiveItem)) {
            if (isExpressTarget) ExpressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=use_type_mismatch needsPassive=" + (requirePassiveItem ? "1" : "0") + " needsActive=" + (requireActiveItem ? "1" : "0"));
            return false;
        }
        if (!OwnerMatchesItemKind(ownerIcon, itemKind)) {
            if (isExpressTarget) ExpressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=item_kind_mismatch expected=" + String(itemKind || ""));
            return false;
        }
        if (!OwnerMatchesTier(ownerIcon, itemTier)) {
            if (isExpressTarget) ExpressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=tier_mismatch expected=" + String(itemTier));
            return false;
        }
        if (!OwnerMatchesMirrorCategory(ownerIcon, target, cfg)) {
            if (isExpressTarget) ExpressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=filter_bucket_disabled style=" + ResolveTargetStyle(target));
            return false;
        }
        if (isExpressTarget) ExpressShotLog("match ownerId=" + String(entry.ownerId || "") + " src=" + String(entry.iconSrc || "") + " state=" + String(entry.cooldownState || ""));
        return true;
    }

    function RemoveItemMirrorOverlay(root) {
        var overlay = GetCachedPanel("itemMirrorOverlay");
        if (!IsPanelValid(overlay)) {
            overlay = root.FindChildTraverse("QOLItemMirrorRoot");
        }
        if (IsPanelValid(overlay)) {
            overlay.style.visibility = "collapse";
            overlay.DeleteAsync(0);
        }
        SetCachedPanel("itemMirrorOverlay", null);
        SetCachedPanel("itemMirrorIcon", null);
        SetCachedPanel("itemMirrorModContainer", null);
        SetCachedPanel("itemMirrorBackground", null);
        SetCachedPanel("itemMirrorIconInner", null);
        SetCachedPanel("itemMirrorImage", null);
        SetCachedPanel("itemMirrorItemHidden", null);
        SetCachedPanel("itemMirrorActiveTagContainer", null);
        SetCachedPanel("itemMirrorEnhanced", null);
        SetCachedPanel("itemMirrorCooldownMask", null);
        SetCachedPanel("itemMirrorCooldownText", null);
        SetCachedPanel("itemMirrorSourceIcon", null);
        SetCachedPanel("itemMirrorSourceContainer", null);
        SetCachedPanel("itemMirrorSourceItemClass", null);
        SetCachedPanel("itemMirrorRow", null);
        State.cachedPanels.itemMirrorSlots = [];
        State.itemMirror = {
            probeLastScanMs: 0,
            probeLastSignature: "",
            probeWasEnabled: false,
            displayMode: "",
            lastLayoutSig: "",
            lastRowOpacityPanel: null,
            lastRowOpacityText: "",
            fastModeUntilMs: State.itemMirror.fastModeUntilMs,
            debugLastMs: State.itemMirror.debugLastMs,
            debugLastSig: State.itemMirror.debugLastSig,
            wasOnCooldown: false,
            readyAnimUntilMs: 0,
            cdLastDeg: null,
            cdLastMs: 0,
            cdSlopeEma: null,
            cdDisplayLock: null,
            lastSrc: "",
            lastClip: "",
            classCache: {},
            visualOpacityText: State.itemMirror.visualOpacityText,
            sources: [],
            nextSourceId: 1,
            nextAcquireOrder: 1,
            slotStates: {},
            runtimePanelIds: [],
            nextRuntimePanelId: 1,
            exceptionGroupAssignments: {},
            lastShopOpen: false
        };
        RuntimeTaskReset("item_mirror_render");
        RuntimeTaskReset("item_mirror_scan");
        State.itemMirror.fastModeUntilMs = 0;
    }

    function UpdateItemMirrorProbe(root, cfg) {
        return UpdateItemMirrorProbeMulti(root, cfg);
    }

    function EnsureItemMirrorOverlayMulti(root) {
        var overlay = GetCachedPanel("itemMirrorOverlay");
        if (!IsPanelValid(overlay)) {
            overlay = root.FindChildTraverse("QOLItemMirrorRoot");
            if (!overlay) {
                var parent = GetGameplayHudPanel(root);
                if (!parent) return null;
                overlay = $.CreatePanel("Panel", parent, "QOLItemMirrorRoot", {
                    hittest: "false",
                    hittestchildren: "false"
                });
            }
            SetCachedPanel("itemMirrorOverlay", overlay);
        }
        if (!overlay) return null;

        overlay.style.horizontalAlign = "center";
        overlay.style.verticalAlign = "center";
        overlay.style.flowChildren = "down";
        overlay.style.overflow = "noclip";
        overlay.style.x = "0px";
        overlay.style.y = "150px";
        overlay.style.uiScale = "100%";
        overlay.style.visibility = "collapse";

        var row = GetCachedPanel("itemMirrorRow");
        if (!IsPanelValid(row)) {
            row = overlay.FindChildTraverse("QOLItemMirrorRow");
            if (!row) {
                row = $.CreatePanel("Panel", overlay, "QOLItemMirrorRow", {
                    hittest: "false",
                    hittestchildren: "false"
                });
            }
            SetCachedPanel("itemMirrorRow", row);
        }
        if (!row) return overlay;
        row.style.flowChildren = "right";
        row.style.horizontalAlign = "center";
        row.style.verticalAlign = "center";
        row.style.width = "fit-children";
        row.style.height = "fit-children";
        row.style.overflow = "noclip";

        var legacyIcon = overlay.FindChildTraverse("QOLItemMirrorIcon");
        if (IsPanelValid(legacyIcon) && legacyIcon.GetParent && legacyIcon.GetParent() === overlay) {
            legacyIcon.DeleteAsync(0);
        }

        if (!State.cachedPanels.itemMirrorSlots) State.cachedPanels.itemMirrorSlots = [];
        return overlay;
    }

    function EnsureItemMirrorSlotMulti(slotIndex) {
        var row = GetCachedPanel("itemMirrorRow");
        if (!IsPanelValid(row)) return null;
        if (!State.cachedPanels.itemMirrorSlots) State.cachedPanels.itemMirrorSlots = [];

        var slots = State.cachedPanels.itemMirrorSlots || [];
        var slotObj = slots[slotIndex];
        if (slotObj && IsPanelValid(slotObj.icon) && IsPanelValid(slotObj.modContainer)) {
            return slotObj;
        }

        var mirrorIcon = $.CreatePanel("Panel", row, "QOLItemMirrorIcon_" + String(slotIndex), {
            hittest: "false",
            hittestchildren: "false"
        });
        mirrorIcon.AddClass("QOLItemMirrorIcon");
        var baseSizeText = String(Math.max(1, Math.round(Number(ITEM_MIRROR_ICON_BASE_SIZE_PX) || 45))) + "px";
        mirrorIcon.style.width = baseSizeText;
        mirrorIcon.style.height = baseSizeText;
        mirrorIcon.style.flowChildren = "none";
        mirrorIcon.style.padding = "0px";
        mirrorIcon.style.margin = "2px 6px 2px 6px";
        mirrorIcon.style.overflow = "noclip";
        mirrorIcon.style.borderRadius = "0px";
        mirrorIcon.style.horizontalAlign = "center";
        mirrorIcon.style.verticalAlign = "center";

        var mirrorSlot = $.CreatePanel("Panel", mirrorIcon, "modIconContainer", {
            hittest: "false",
            hittestchildren: "false"
        });
        mirrorSlot.AddClass("mod_icon_single_container");
        mirrorSlot.AddClass("QOLItemMirrorModContainer");
        mirrorSlot.style.width = baseSizeText;
        mirrorSlot.style.height = baseSizeText;
        mirrorSlot.style.flowChildren = "none";
        mirrorSlot.style.backgroundColor = "none";
        mirrorSlot.style.padding = "0px";
        mirrorSlot.style.margin = "0px";
        mirrorSlot.style.overflow = "noclip";
        mirrorSlot.style.borderRadius = "0px";
        mirrorSlot.style.opacityMask = "none";
        mirrorSlot.style.horizontalAlign = "center";
        mirrorSlot.style.verticalAlign = "center";

        var viewport = $.CreatePanel("Panel", mirrorSlot, "", {
            hittest: "false",
            hittestchildren: "false"
        });
        viewport.AddClass("QOLItemMirrorViewport");
        viewport.style.width = "100%";
        viewport.style.height = "100%";
        viewport.style.padding = "0px";
        viewport.style.margin = "0px";
        viewport.style.horizontalAlign = "center";
        viewport.style.verticalAlign = "center";
        viewport.style.borderRadius = "50%";
        viewport.style.overflow = "clip clip";

        var bg = $.CreatePanel("Panel", viewport, "mod_icon_background", {
            hittest: "false",
            hittestchildren: "false"
        });
        bg.AddClass("mod_icon_background_container");
        bg.AddClass("QOLItemMirrorBackground");
        bg.style.width = "100%";
        bg.style.height = "100%";
        bg.style.backgroundColor = "none";
        bg.style.padding = "0px";
        bg.style.margin = "0px";
        bg.style.overflow = "clip clip";
        bg.style.borderRadius = "0px";
        bg.style.visibility = "collapse";
        SetPanelOpacitySafe(bg, 0, 0);
        bg.style.width = "0px";
        bg.style.height = "0px";
        bg.style.horizontalAlign = "center";
        bg.style.verticalAlign = "center";

        var iconInner = $.CreatePanel("Panel", viewport, "mod_icon", {
            hittest: "false",
            hittestchildren: "false"
        });
        iconInner.AddClass("mod_icon");
        iconInner.AddClass("ability_icon");
        iconInner.AddClass("QOLItemMirrorIconInner");
        iconInner.style.width = "100%";
        iconInner.style.height = "100%";
        iconInner.style.padding = "0px";
        iconInner.style.margin = "0px";
        iconInner.style.overflow = "clip clip";
        iconInner.style.borderRadius = "0px";
        iconInner.style.horizontalAlign = "center";
        iconInner.style.verticalAlign = "center";

        var img = $.CreatePanel("Image", viewport, "ModIconImage", {
            hittest: "false",
            hittestchildren: "false",
            scaling: "stretch",
            defaultsrc: "none"
        });
        img.AddClass("QOLItemMirrorImage");
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.visibility = "collapse";
        img.style.padding = "0px";
        img.style.margin = "0px";
        img.style.overflow = "clip clip";
        img.style.borderRadius = "0px";
        img.style.horizontalAlign = "center";
        img.style.verticalAlign = "center";

        var mask = $.CreatePanel("Panel", viewport, "CooldownMask", {
            hittest: "false",
            hittestchildren: "false"
        });
        mask.AddClass("QOLItemMirrorCooldownMask");
        mask.style.width = "100%";
        mask.style.height = "100%";
        mask.style.padding = "0px";
        mask.style.margin = "0px";
        mask.style.horizontalAlign = "center";
        mask.style.verticalAlign = "center";
        mask.style.borderRadius = "0px";
        mask.style.clip = "radial(50% 50%, 0deg, 0deg)";
        mask.style.opacityMask = "none";
        mask.style.overflow = "clip clip";
        mask.style.zIndex = "10";

        var cdText = $.CreatePanel("Label", mirrorIcon, "", {
            hittest: "false",
            hittestchildren: "false"
        });
        cdText.AddClass("QOLItemMirrorCooldownText");
        cdText.style.visibility = "collapse";
        cdText.style.width = "100%";
        cdText.style.height = "100%";
        cdText.style.horizontalAlign = "center";
        cdText.style.verticalAlign = "center";
        cdText.style.zIndex = "20";

        var readyOverlay = $.CreatePanel("Panel", viewport, "", {
            hittest: "false",
            hittestchildren: "false"
        });
        readyOverlay.AddClass("QOLItemMirrorReadyOverlay");
        readyOverlay.style.width = "100%";
        readyOverlay.style.height = "100%";
        readyOverlay.style.horizontalAlign = "center";
        readyOverlay.style.verticalAlign = "center";
        readyOverlay.style.overflow = "clip clip";
        readyOverlay.style.zIndex = "30";

        slotObj = {
            icon: mirrorIcon,
            modContainer: mirrorSlot,
            background: bg,
            iconInner: iconInner,
            image: img,
            viewport: viewport,
            cooldownMask: mask,
            cooldownText: cdText,
            readyOverlay: readyOverlay,
            sourceKey: ""
        };
        slots[slotIndex] = slotObj;
        return slotObj;
    }

    function GetStableRuntimePanelId(panel) {
        if (!panel) return 0;
        var pool = State.itemMirror.runtimePanelIds || [];
        // Prune dead panel references on each lookup to prevent unbounded
        // growth across shop open/close cycles during a long match.
        var cleaned = [];
        var found = 0;
        for (var i = 0; i < pool.length; i++) {
            var rec = pool[i];
            if (!rec || !IsPanelValid(rec.panel)) continue;
            cleaned.push(rec);
            if (rec.panel === panel) found = Number(rec.id) || 0;
        }
        State.itemMirror.runtimePanelIds = cleaned;
        if (found) return found;
        var nextId = Number(State.itemMirror.nextRuntimePanelId) || 1;
        cleaned.push({ panel: panel, id: nextId });
        State.itemMirror.runtimePanelIds = cleaned;
        State.itemMirror.nextRuntimePanelId = nextId + 1;
        return nextId;
    }

    function GetExceptionEntryKey(entry) {
        if (!entry) return "p0";
        var pid = GetStableRuntimePanelId(entry.iconContainer || entry.ownerIcon);
        return "p" + String(pid);
    }

    function BuildGroupedExceptionMatches(entries, usedEntryIndices, groupedExceptionTargets, cfg) {
        var out = [];
        if (!entries || !entries.length || !groupedExceptionTargets || !groupedExceptionTargets.length) return out;

        var grouped = {};
        for (var g = 0; g < groupedExceptionTargets.length; g++) {
            var gm = groupedExceptionTargets[g];
            if (!gm || !gm.target) continue;
            var groupName = gm.target.exceptionGroup ? String(gm.target.exceptionGroup) : "__default__";
            if (!grouped[groupName]) grouped[groupName] = [];
            grouped[groupName].push(gm);
        }

        var groupNames = Object.keys(grouped);
        var assignments = State.itemMirror.exceptionGroupAssignments || {};

        for (var gn = 0; gn < groupNames.length; gn++) {
            var group = groupNames[gn];
            var metas = grouped[group];
            var candidates = [];
            var targetUsed = {};
            var candidateAssigned = {};

            for (var ei = 0; ei < entries.length; ei++) {
                if (usedEntryIndices[ei]) continue;
                var entry = entries[ei];
                var matchedTargets = [];
                for (var mt = 0; mt < metas.length; mt++) {
                    var meta = metas[mt];
                    if (!SourceEntryMatchesTarget(entry, meta.target, cfg)) continue;
                    matchedTargets.push(meta);
                }
                if (matchedTargets.length > 0) {
                    candidates.push({ entryIndex: ei, entry: entry, matchedTargets: matchedTargets });
                }
            }

            function assignCandidate(candidateIndex, targetMeta, reason) {
                if (candidateAssigned[candidateIndex]) return;
                if (!targetMeta || targetUsed[targetMeta.targetIndex]) return;
                var c = candidates[candidateIndex];
                if (!c) return;
                candidateAssigned[candidateIndex] = true;
                targetUsed[targetMeta.targetIndex] = true;
                usedEntryIndices[c.entryIndex] = true;

                var assignKey = group + "|" + GetExceptionEntryKey(c.entry);
                assignments[assignKey] = targetMeta.targetIndex;
                ItemMirrorExceptionLog(
                    "group=" + group +
                    " ownerId=" + String(c.entry.ownerId || "") +
                    " -> " + String(targetMeta.target.className || "") +
                    " via=" + String(reason || "unknown")
                );

                out.push({
                    ownerIcon: c.entry.ownerIcon,
                    iconContainer: c.entry.iconContainer,
                    ownerId: c.entry.ownerId,
                    cooldownState: c.entry.cooldownState,
                    iconSrc: c.entry.iconSrc,
                    sourceImage: c.entry.sourceImage,
                    cooldownMask: c.entry.cooldownMask,
                    itemClassName: targetMeta.target.className,
                    targetIconSrc: targetMeta.target.iconSrc,
                    targetIndex: targetMeta.targetIndex
                });
            }

            // Pass A: candidates that map to exactly one target.
            for (var ca = 0; ca < candidates.length; ca++) {
                if (candidateAssigned[ca]) continue;
                var candA = candidates[ca];
                if (!candA || candA.matchedTargets.length !== 1) continue;
                assignCandidate(ca, candA.matchedTargets[0], "single_match");
            }

            // Pass B: icon-src tie-break when available.
            for (var cb = 0; cb < candidates.length; cb++) {
                if (candidateAssigned[cb]) continue;
                var candB = candidates[cb];
                if (!candB || candB.matchedTargets.length <= 1) continue;
                var src = String(candB.entry.iconSrc || "");
                if (!src) continue;
                var iconHits = [];
                for (var ih = 0; ih < candB.matchedTargets.length; ih++) {
                    var metaHit = candB.matchedTargets[ih];
                    if (IconSourceMatchesTarget(src, metaHit.target.iconSrc)) iconHits.push(metaHit);
                }
                if (iconHits.length === 1 && !targetUsed[iconHits[0].targetIndex]) {
                    assignCandidate(cb, iconHits[0], "icon_tiebreak");
                }
            }

            // Pass C: sticky assignment by panel identity.
            for (var cc = 0; cc < candidates.length; cc++) {
                if (candidateAssigned[cc]) continue;
                var candC = candidates[cc];
                if (!candC) continue;
                var stickyKey = group + "|" + GetExceptionEntryKey(candC.entry);
                var preferredTargetIndex = assignments.hasOwnProperty(stickyKey) ? Number(assignments[stickyKey]) : -1;
                if (preferredTargetIndex < 0) continue;
                var stickyMeta = null;
                for (var sm = 0; sm < candC.matchedTargets.length; sm++) {
                    var metaSticky = candC.matchedTargets[sm];
                    if (metaSticky.targetIndex === preferredTargetIndex) {
                        stickyMeta = metaSticky;
                        break;
                    }
                }
                if (stickyMeta && !targetUsed[stickyMeta.targetIndex]) {
                    assignCandidate(cc, stickyMeta, "sticky_panel");
                }
            }

            // Pass D: deterministic fallback by declaration order.
            var availableTargets = [];
            for (var at = 0; at < metas.length; at++) {
                if (!targetUsed[metas[at].targetIndex]) availableTargets.push(metas[at]);
            }
            availableTargets.sort(function(a, b) { return a.targetIndex - b.targetIndex; });

            for (var cd = 0; cd < candidates.length; cd++) {
                if (candidateAssigned[cd]) continue;
                var candD = candidates[cd];
                if (!candD) continue;
                var chosen = null;
                for (var ad = 0; ad < availableTargets.length; ad++) {
                    var possible = availableTargets[ad];
                    if (targetUsed[possible.targetIndex]) continue;
                    for (var md = 0; md < candD.matchedTargets.length; md++) {
                        if (candD.matchedTargets[md].targetIndex === possible.targetIndex) {
                            chosen = possible;
                            break;
                        }
                    }
                    if (chosen) break;
                }
                if (chosen) assignCandidate(cd, chosen, "deterministic_fallback");
            }
        }

        State.itemMirror.exceptionGroupAssignments = assignments;
        return out;
    }

    function BuildItemMirrorSourcesMulti(root, cfg) {
        var outMatches = [];
        var sourceIndex = BuildItemMirrorSourceIndex(root);
        var entries = sourceIndex.entries || [];
        var usedEntryIndices = {};
        var normalTargets = [];
        var groupedExceptionTargets = [];
        var exceptionTargets = [];

        for (var tiSplit = 0; tiSplit < ITEM_MIRROR_TARGETS.length; tiSplit++) {
            var splitTarget = ITEM_MIRROR_TARGETS[tiSplit];
            if (splitTarget && splitTarget.skipClassMatch && splitTarget.exceptionGroup) {
                groupedExceptionTargets.push({ target: splitTarget, targetIndex: tiSplit });
            } else if (splitTarget && splitTarget.skipClassMatch) {
                exceptionTargets.push({ target: splitTarget, targetIndex: tiSplit });
            } else {
                normalTargets.push({ target: splitTarget, targetIndex: tiSplit });
            }
        }

        // Pass 1: strict class-based targets take priority.
        for (var mi = 0; mi < entries.length; mi++) {
            var entry = entries[mi];
            for (var nt = 0; nt < normalTargets.length; nt++) {
                var normal = normalTargets[nt];
                var normalTarget = normal.target;
                if (!SourceEntryMatchesTarget(entry, normalTarget, cfg)) continue;
                outMatches.push({
                    ownerIcon: entry.ownerIcon,
                    iconContainer: entry.iconContainer,
                    ownerId: entry.ownerId,
                    cooldownState: entry.cooldownState,
                    iconSrc: entry.iconSrc,
                    sourceImage: entry.sourceImage,
                    cooldownMask: entry.cooldownMask,
                    itemClassName: normalTarget.className,
                    targetIconSrc: normalTarget.iconSrc,
                    targetIndex: normal.targetIndex
                });
                usedEntryIndices[mi] = true;
                break;
            }
        }

        // Pass 2: grouped classless exceptions (structural twins).
        var groupedMatches = BuildGroupedExceptionMatches(entries, usedEntryIndices, groupedExceptionTargets, cfg);
        for (var gmIdx = 0; gmIdx < groupedMatches.length; gmIdx++) {
            outMatches.push(groupedMatches[gmIdx]);
        }

        // Pass 3: remaining classless exceptions.
        for (var miEx = 0; miEx < entries.length; miEx++) {
            if (usedEntryIndices[miEx]) continue;
            var exceptionEntry = entries[miEx];
            var exceptionMatchCount = 0;
            var exceptionChosen = null;
            for (var et = 0; et < exceptionTargets.length; et++) {
                var exceptionMeta = exceptionTargets[et];
                if (!SourceEntryMatchesTarget(exceptionEntry, exceptionMeta.target, cfg)) continue;
                exceptionMatchCount++;
                exceptionChosen = exceptionMeta;
            }
            if (exceptionMatchCount === 1 && exceptionChosen) {
                outMatches.push({
                    ownerIcon: exceptionEntry.ownerIcon,
                    iconContainer: exceptionEntry.iconContainer,
                    ownerId: exceptionEntry.ownerId,
                    cooldownState: exceptionEntry.cooldownState,
                    iconSrc: exceptionEntry.iconSrc,
                    sourceImage: exceptionEntry.sourceImage,
                    cooldownMask: exceptionEntry.cooldownMask,
                    itemClassName: exceptionChosen.target.className,
                    targetIconSrc: exceptionChosen.target.iconSrc,
                    targetIndex: exceptionChosen.targetIndex
                });
                usedEntryIndices[miEx] = true;
            } else if (exceptionMatchCount > 1) {
                ItemMirrorExceptionLog(
                    "reject ownerId=" + String(exceptionEntry.ownerId || "") +
                    " reason=exception_ambiguous count=" + String(exceptionMatchCount)
                );
            }
        }

        var summary = [];
        var structureSummary = [];
        for (var si = 0; si < outMatches.length; si++) {
            var match = outMatches[si];
            summary.push(match.itemClassName + "::" + match.ownerId + "|" + match.cooldownState + "|" + match.iconSrc);
            // Cooldown state changes are read from the live panel during render.
            // They should not force a structural rescan of every owned item.
            structureSummary.push(match.itemClassName + "::" + match.ownerId + "|" + match.iconSrc);
        }

        return {
            modsContainersCount: sourceIndex.modsContainersCount,
            scannedCount: sourceIndex.scannedCount,
            matches: outMatches,
            summary: summary,
            structureSummary: structureSummary
        };
    }

    function GetItemMirrorSemanticKey(sourceLike) {
        if (!sourceLike) return "||";
        var cls = sourceLike.itemClassName ? String(sourceLike.itemClassName) : "";
        var icon = sourceLike.iconSrc ? String(sourceLike.iconSrc) : "";
        var targetIcon = sourceLike.targetIconSrc ? String(sourceLike.targetIconSrc) : "";
        return cls + "|" + icon + "|" + targetIcon;
    }

    function GetItemMirrorClassKey(sourceLike) {
        if (!sourceLike) return "";
        return sourceLike.itemClassName ? String(sourceLike.itemClassName) : "";
    }

    function ReconcileItemMirrorSourcesMulti(scannedMatches) {
        var previous = State.itemMirror.sources || [];
        var usedPrev = {};
        var next = [];
        var semanticBuckets = {};
        var classBuckets = {};

        for (var pb = 0; pb < previous.length; pb++) {
            var prevSource = previous[pb];
            if (!prevSource) continue;
            var semanticKey = GetItemMirrorSemanticKey(prevSource);
            if (!semanticBuckets[semanticKey]) semanticBuckets[semanticKey] = [];
            semanticBuckets[semanticKey].push({ idx: pb, src: prevSource });

            var classKey = GetItemMirrorClassKey(prevSource);
            if (classKey.length > 0) {
                if (!classBuckets[classKey]) classBuckets[classKey] = [];
                classBuckets[classKey].push({ idx: pb, src: prevSource });
            }
        }

        var semanticKeys = Object.keys(semanticBuckets);
        for (var sk = 0; sk < semanticKeys.length; sk++) {
            var semanticBucket = semanticBuckets[semanticKeys[sk]];
            semanticBucket.sort(function(a, b) {
                var ao = (a && a.src && a.src.acquisitionOrder !== undefined && a.src.acquisitionOrder !== null) ? Number(a.src.acquisitionOrder) : 999999;
                var bo = (b && b.src && b.src.acquisitionOrder !== undefined && b.src.acquisitionOrder !== null) ? Number(b.src.acquisitionOrder) : 999999;
                return ao - bo;
            });
        }
        var classKeys = Object.keys(classBuckets);
        for (var ck = 0; ck < classKeys.length; ck++) {
            var classBucket = classBuckets[classKeys[ck]];
            classBucket.sort(function(a, b) {
                var ao = (a && a.src && a.src.acquisitionOrder !== undefined && a.src.acquisitionOrder !== null) ? Number(a.src.acquisitionOrder) : 999999;
                var bo = (b && b.src && b.src.acquisitionOrder !== undefined && b.src.acquisitionOrder !== null) ? Number(b.src.acquisitionOrder) : 999999;
                return ao - bo;
            });
        }

        for (var i = 0; i < scannedMatches.length; i++) {
            var match = scannedMatches[i];
            var existing = null;

            // 1) Strongest match: same panel objects.
            for (var p = 0; p < previous.length; p++) {
                if (usedPrev[p]) continue;
                var prev = previous[p];
                if (!prev) continue;
                if (prev.ownerIcon === match.ownerIcon &&
                    prev.iconContainer === match.iconContainer &&
                    prev.itemClassName === match.itemClassName) {
                    existing = prev;
                    usedPrev[p] = true;
                    break;
                }
            }

            // 2) Fallback: same semantic identity (class + icon srcs), for rebuilt/reordered trees.
            if (!existing) {
                var semKey = GetItemMirrorSemanticKey(match);
                var semBucket = semanticBuckets[semKey] || null;
                if (semBucket) {
                    while (semBucket.length > 0) {
                        var semCandidate = semBucket.shift();
                        if (!semCandidate) continue;
                        if (usedPrev[semCandidate.idx]) continue;
                        existing = semCandidate.src;
                        usedPrev[semCandidate.idx] = true;
                        break;
                    }
                }
            }

            // 3) Last fallback: same class when icon src is unstable/late-loaded.
            if (!existing) {
                var clsKey = GetItemMirrorClassKey(match);
                var clsBucket = clsKey.length > 0 ? (classBuckets[clsKey] || null) : null;
                if (clsBucket) {
                    while (clsBucket.length > 0) {
                        var clsCandidate = clsBucket.shift();
                        if (!clsCandidate) continue;
                        if (usedPrev[clsCandidate.idx]) continue;
                        existing = clsCandidate.src;
                        usedPrev[clsCandidate.idx] = true;
                        break;
                    }
                }
            }

            var key = existing && existing.key ? existing.key : ("item_src_" + String(State.itemMirror.nextSourceId++));
            var acquisitionOrder = (existing && isFinite(Number(existing.acquisitionOrder)))
                ? Number(existing.acquisitionOrder)
                : Number(State.itemMirror.nextAcquireOrder++);
            next.push({
                key: key,
                acquisitionOrder: acquisitionOrder,
                ownerIcon: match.ownerIcon,
                iconContainer: match.iconContainer,
                itemClassName: match.itemClassName,
                targetIconSrc: match.targetIconSrc,
                targetIndex: match.targetIndex,
                ownerId: match.ownerId,
                cooldownState: match.cooldownState,
                iconSrc: match.iconSrc,
                sourceImage: match.sourceImage,
                cooldownMask: match.cooldownMask
            });
        }

        next.sort(function(a, b) {
            var ao = (a.acquisitionOrder === undefined || a.acquisitionOrder === null) ? 999999 : Number(a.acquisitionOrder);
            var bo = (b.acquisitionOrder === undefined || b.acquisitionOrder === null) ? 999999 : Number(b.acquisitionOrder);
            if (ao !== bo) return ao - bo;
            var ai = (a.targetIndex === undefined || a.targetIndex === null) ? 9999 : Number(a.targetIndex);
            var bi = (b.targetIndex === undefined || b.targetIndex === null) ? 9999 : Number(b.targetIndex);
            if (ai !== bi) return ai - bi;
            var av = String(a.ownerId || "") + "|" + String(a.iconSrc || "");
            var bv = String(b.ownerId || "") + "|" + String(b.iconSrc || "");
            if (av < bv) return -1;
            if (av > bv) return 1;
            return 0;
        });

        State.itemMirror.sources = next;
        return next;
    }

    function SyncItemMirrorStaticSlotState(slotObj, source, sourceIcon, sourceMod, slotState) {
        if (!slotObj || !source || !sourceIcon || !slotState) return;
        var mirrorIcon = slotObj.icon;
        var mirrorSlot = slotObj.modContainer;
        if (!mirrorIcon || !mirrorSlot) return;

        var sourceItemClassName = source.itemClassName || "";
        var sourceSig = [
            source.key || "",
            String(GetStableRuntimePanelId(sourceIcon)),
            String(GetStableRuntimePanelId(sourceMod)),
            String(sourceItemClassName),
            String(source.iconSrc || ""),
            String(source.targetIconSrc || "")
        ].join("|");
        if (slotState.staticSyncSig === sourceSig) return;

        if (sourceMod) {
            SyncPanelClasses(sourceMod, mirrorSlot, "itemMirrorSlotFromContainer:" + source.key, ["mod_icon_single_container"]);
        }
        if (sourceItemClassName && sourceItemClassName.length > 0 && sourceMod && sourceMod.BHasClass) {
            var hasItemClass = sourceMod.BHasClass(sourceItemClassName);
            mirrorSlot.SetHasClass(sourceItemClassName, hasItemClass);
            if (slotObj.background) slotObj.background.SetHasClass(sourceItemClassName, hasItemClass);
            if (slotObj.iconInner) slotObj.iconInner.SetHasClass(sourceItemClassName, hasItemClass);
            if (slotObj.image) slotObj.image.SetHasClass(sourceItemClassName, hasItemClass);
        }

        SyncPanelClasses(sourceIcon, mirrorIcon, "itemMirrorIconOwner:" + source.key, ["OnCooldown", "OffCooldown", "VerticalCooldown", "isWeapon", "isArmor", "isTech"]);
        SyncPanelClasses(sourceIcon, mirrorSlot, "itemMirrorSlotFromOwner:" + source.key, ["OnCooldown", "OffCooldown", "VerticalCooldown", "isWeapon", "isArmor", "isTech"]);
        slotState.staticSyncSig = sourceSig;
    }

    // SyncMirrorItemFromSourceMulti — synchronizes item mirror panel state from a source entry:
    // manages cooldown EMA smoothing, direction tracking, display-lock window, and visual styling.
    function SyncMirrorItemFromSourceMulti(slotObj, source) {
        if (!slotObj || !source || !source.ownerIcon) return;
        var sourceIcon = source.ownerIcon;
        var sourceModContainer = source.iconContainer;
        var sourceItemClassName = source.itemClassName;
        var sourceTargetIconSrc = source.targetIconSrc;

        var mirrorIcon = slotObj.icon;
        var mirrorSlot = slotObj.modContainer;
        var mirrorMask = slotObj.cooldownMask;
        var mirrorCooldownText = slotObj.cooldownText;
        var mirrorReadyOverlay = slotObj.readyOverlay;
        var mirrorIconInner = slotObj.iconInner;
        var mirrorImage = slotObj.image;
        if (!mirrorSlot || !sourceIcon || !mirrorIcon) return;

        var slotState = State.itemMirror.slotStates[source.key];
        if (!slotState) {
            slotState = {
                lastSrc: "",
                lastClip: "",
                lastMaskScaleSig: "",
                wasOnCooldown: false,
                cdLastDeg: null,
                cdLastMs: 0,
                cdSlopeEma: null,
                cdDirection: 0,
                cdDisplayLock: null,
                lastSizeSig: "",
                staticSyncSig: "",
                lastCooldownClassSig: "",
                lastMirrorImagePanel: null,
                cooldownTextStyled: false,
                nextCooldownTextProbeMs: 0,
                lastProbeCooldownText: "",
                wasCooldownTextVisible: false,
                lastCooldownEndMs: 0,
                rapidRetriggerSuppressUntilMs: 0
            };
            State.itemMirror.slotStates[source.key] = slotState;
        }
        var wasOnCooldownBefore = !!slotState.wasOnCooldown;

        var sourceMod = IsPanelValid(sourceModContainer) ? sourceModContainer : (sourceIcon.FindChildTraverse ? sourceIcon.FindChildTraverse("modIconContainer") : null);
        if (sourceMod && sourceMod !== source.iconContainer) source.iconContainer = sourceMod;
        var sourceImage = IsPanelValid(source.sourceImage) ? source.sourceImage : null;
        if (!sourceImage && sourceMod && sourceMod.FindChildTraverse) sourceImage = sourceMod.FindChildTraverse("ModIconImage");
        if (!sourceImage && sourceIcon.FindChildTraverse) sourceImage = sourceIcon.FindChildTraverse("ModIconImage");
        source.sourceImage = sourceImage || null;
        var size = ResolveMirrorItemSize(sourceIcon, sourceMod);
        var sizeSig = size.width + "|" + size.height;
        if (mirrorIcon.style.margin !== "2px 6px 2px 6px") {
            mirrorIcon.style.margin = "2px 6px 2px 6px";
        }
        if (mirrorCooldownText) {
            if (!slotState.cooldownTextStyled) {
                mirrorCooldownText.style.width = "fit-children";
                mirrorCooldownText.style.height = "fit-children";
                mirrorCooldownText.style.fontSize = "20px";
                mirrorCooldownText.style.fontWeight = "bold";
                mirrorCooldownText.style.margin = "0px";
                mirrorCooldownText.style.padding = "0px";
                mirrorCooldownText.style.horizontalAlign = "center";
                mirrorCooldownText.style.verticalAlign = "center";
                mirrorCooldownText.style.textAlign = "center";
                mirrorCooldownText.style.textOverflow = "clip";
                mirrorCooldownText.style.y = "0px";
                slotState.cooldownTextStyled = true;
            }
        }

        SyncItemMirrorStaticSlotState(slotObj, source, sourceIcon, sourceMod, slotState);

        // Keep mirror icon sizing deterministic regardless of source panel classes/style.
        if (slotState.lastSizeSig !== sizeSig ||
            mirrorIcon.style.width !== size.width ||
            mirrorIcon.style.height !== size.height ||
            mirrorSlot.style.width !== size.width ||
            mirrorSlot.style.height !== size.height) {
            mirrorIcon.style.width = size.width;
            mirrorIcon.style.height = size.height;
            mirrorSlot.style.width = size.width;
            mirrorSlot.style.height = size.height;
            slotState.lastSizeSig = sizeSig;
        }

        if (mirrorSlot.style.visibility !== "visible") mirrorSlot.style.visibility = "visible";
        if (mirrorSlot.style.backgroundColor !== "none") mirrorSlot.style.backgroundColor = "none";

        var hasImageSrc = false;
        if (mirrorImage && sourceImage) {
            if (slotState.lastMirrorImagePanel !== mirrorImage) {
                slotState.lastMirrorImagePanel = mirrorImage;
                slotState.lastSrc = "";
            }
            var forcedSrc = "";
            if (sourceTargetIconSrc && sourceTargetIconSrc.length > 0) {
                forcedSrc = sourceTargetIconSrc;
            } else if (sourceItemClassName && ITEM_MIRROR_FORCED_IMAGE_BY_CLASS.hasOwnProperty(sourceItemClassName)) {
                forcedSrc = ITEM_MIRROR_FORCED_IMAGE_BY_CLASS[sourceItemClassName];
            }

            var srcVal = forcedSrc;
            if (!srcVal || srcVal.length === 0) {
                srcVal = sourceImage.GetAttributeString ? sourceImage.GetAttributeString("src", "") : "";
                if ((!srcVal || srcVal === "none") && sourceImage.GetAttributeString) {
                    srcVal = sourceImage.GetAttributeString("defaultsrc", "");
                }
            }
            if (srcVal && srcVal !== "none") {
                try {
                    if (slotState.lastSrc !== srcVal) {
                        if (mirrorImage.SetImage) {
                            mirrorImage.SetImage(srcVal);
                        } else {
                            mirrorImage.style.backgroundImage = 'url("' + srcVal + '")';
                        }
                        slotState.lastSrc = srcVal;
                    }
                    hasImageSrc = true;
                } catch(e) { QOL_WARN("core", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
            }
        }

        if (mirrorImage) {
            var imageVisibility = hasImageSrc ? "visible" : "collapse";
            if (mirrorImage.style.visibility !== imageVisibility) mirrorImage.style.visibility = imageVisibility;
            if (mirrorImage.style.zIndex !== "5") mirrorImage.style.zIndex = "5";
        }
        if (mirrorIconInner) {
            var iconInnerVisibility = hasImageSrc ? "collapse" : "visible";
            if (mirrorIconInner.style.visibility !== iconInnerVisibility) mirrorIconInner.style.visibility = iconInnerVisibility;
            if (mirrorIconInner.style.zIndex !== "4") mirrorIconInner.style.zIndex = "4";
        }

        if (!mirrorMask) return;
        var sourceMask = IsPanelValid(source.cooldownMask) ? source.cooldownMask : null;
        if (!sourceMask && sourceIcon.FindChildTraverse) sourceMask = sourceIcon.FindChildTraverse("CooldownMask");
        source.cooldownMask = sourceMask || null;
        var isOnCooldown = sourceIcon.BHasClass && sourceIcon.BHasClass("OnCooldown");
        var isVerticalCooldown = sourceIcon.BHasClass && sourceIcon.BHasClass("VerticalCooldown");
        var nowMs = Date.now ? Date.now() : (new Date()).getTime();

        var startedCooldownCycle = (!wasOnCooldownBefore && !!isOnCooldown);
        if (startedCooldownCycle) {
            var sinceEndMs = (slotState.lastCooldownEndMs > 0) ? (nowMs - slotState.lastCooldownEndMs) : 999999;
            if (sinceEndMs <= ITEM_MIRROR_RAPID_RETRIGGER_WINDOW_MS) {
                slotState.rapidRetriggerSuppressUntilMs = nowMs + ITEM_MIRROR_RAPID_RETRIGGER_SUPPRESS_MS;
                ItemMirrorFlashLog(source.key + " rapid suppress ON (" + String(ITEM_MIRROR_RAPID_RETRIGGER_SUPPRESS_MS) + "ms)");
            } else {
                slotState.rapidRetriggerSuppressUntilMs = 0;
            }
            slotState.cdLastDeg = null;
            slotState.cdLastMs = 0;
            slotState.cdSlopeEma = null;
            slotState.cdDirection = 0;
            slotState.cdDisplayLock = null;
        }

        var cooldownClassSig = (isOnCooldown ? "1" : "0") + "|" + (isVerticalCooldown ? "1" : "0");
        if (slotState.lastCooldownClassSig !== cooldownClassSig) {
            mirrorIcon.SetHasClass("just_ready", false);
            mirrorSlot.SetHasClass("just_ready", false);
            mirrorIcon.SetHasClass("OnCooldown", !!isOnCooldown);
            mirrorIcon.SetHasClass("OffCooldown", !isOnCooldown);
            mirrorIcon.SetHasClass("VerticalCooldown", !!isVerticalCooldown);
            mirrorSlot.SetHasClass("OnCooldown", !!isOnCooldown);
            mirrorSlot.SetHasClass("OffCooldown", !isOnCooldown);
            mirrorSlot.SetHasClass("VerticalCooldown", !!isVerticalCooldown);
            slotState.lastCooldownClassSig = cooldownClassSig;
        }

        var maskClip = "";
        var maskOpacity = "";
        var maskVisibility = "";
        if (sourceMask && sourceMask.style) {
            var clipVal = sourceMask.style.clip;
            var opacityVal = sourceMask.style.opacity;
            var visibilityVal = sourceMask.style.visibility;

            if (clipVal !== undefined && clipVal !== null && clipVal !== "") maskClip = clipVal;
            if (opacityVal !== undefined && opacityVal !== null && opacityVal !== "") maskOpacity = opacityVal;
            if (visibilityVal !== undefined && visibilityVal !== null && visibilityVal !== "") maskVisibility = visibilityVal;
        }

        if (!maskClip && sourceMask) maskClip = GetInlineStyleProperty(sourceMask, "clip");
        if (!maskOpacity && sourceMask) maskOpacity = GetInlineStyleProperty(sourceMask, "opacity");
        if (!maskVisibility && sourceMask) maskVisibility = GetInlineStyleProperty(sourceMask, "visibility");

        if (maskClip && maskClip.length > 0) {
            if (slotState.lastClip !== maskClip) {
                try {
                    mirrorMask.style.clip = maskClip;
                    slotState.lastClip = maskClip;
                } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
            }
        } else if (slotState.lastClip && slotState.lastClip.length > 0) {
            try {
                if (mirrorMask.style.clip !== slotState.lastClip) {
                    mirrorMask.style.clip = slotState.lastClip;
                }
            } catch(e2) { QOL_WARN("core", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
        }
        if (maskOpacity && maskOpacity.length > 0) {
            SetPanelOpacitySafe(mirrorMask, maskOpacity, 1.0);
        }

        var maskScaleSig = isVerticalCooldown ? "1.00, 1.00" : "-1.00, 1.00";
        if (slotState.lastMaskScaleSig !== maskScaleSig) {
            try {
                mirrorMask.style.preTransformScale2d = maskScaleSig;
                slotState.lastMaskScaleSig = maskScaleSig;
            } catch(e4) { QOL_WARN("core", "op failed: " + (e4 && e4.message ? e4.message : String(e4 || ""))); }
        }
        var showMask = !!isOnCooldown;
        if (!showMask && maskVisibility) showMask = (maskVisibility === "visible");
        try { mirrorMask.style.visibility = showMask ? "visible" : "collapse"; } catch(e5) { QOL_WARN("core", "op failed: " + (e5 && e5.message ? e5.message : String(e5 || ""))); }

        var isCooldownTextVisible = false;
        if (mirrorCooldownText) {
            var cooldownText = "";
            var cooldownTextFromDerived = false;
            var cooldownTextDerivedNum = null;
            if (isOnCooldown) {
                if (nowMs >= slotState.nextCooldownTextProbeMs) {
                    var cooldownProbe = ProbeCooldownTextFromSourceIcon(sourceIcon);
                    slotState.lastProbeCooldownText = cooldownProbe.chosen || "";
                    slotState.nextCooldownTextProbeMs = nowMs + ITEM_MIRROR_TEXT_PROBE_INTERVAL_MS;
                }
                cooldownText = slotState.lastProbeCooldownText || "";
                if (cooldownText && cooldownText.length > 0) {
                    slotState.rapidRetriggerSuppressUntilMs = 0;
                }
            }
            if ((!cooldownText || cooldownText.length === 0) && isOnCooldown) {
                var calcClip = maskClip && maskClip.length > 0 ? maskClip : slotState.lastClip;
                var currentDeg = ResolveRadialProgressDeg(calcClip, slotState.cdLastDeg);
                if (isFinite(currentDeg)) {
                    if (currentDeg < 0) currentDeg = 0;
                    if (currentDeg > 360 && currentDeg <= 720) currentDeg = currentDeg % 360;
                    if (currentDeg > 360) currentDeg = 360;
                } else {
                    currentDeg = null;
                }
                if (currentDeg !== null) {
                    if (slotState.cdLastDeg !== null && slotState.cdLastMs > 0) {
                        var dtSec = (nowMs - slotState.cdLastMs) / 1000.0;
                        var dDeg = slotState.cdLastDeg - currentDeg;
                        if (dDeg < -180 || dDeg > 360) {
                            slotState.cdSlopeEma = null;
                            slotState.cdDisplayLock = null;
                            slotState.cdDirection = 0;
                        } else if (dtSec > 0.01 && dtSec < 1.0 && Math.abs(dDeg) > 0.01) {
                            if (slotState.cdDirection === 0 && Math.abs(dDeg) >= 0.05) {
                                slotState.cdDirection = (dDeg > 0) ? 1 : -1;
                            }
                            var signedDelta = 0;
                            if (slotState.cdDirection >= 0 && dDeg > 0) {
                                signedDelta = dDeg;
                            } else if (slotState.cdDirection <= 0 && dDeg < 0) {
                                signedDelta = -dDeg;
                            }
                            if (signedDelta > 0) {
                                var slope = signedDelta / dtSec;
                                if (isFinite(slope) && slope > 0.001 && slope < 5000) {
                                    slotState.cdSlopeEma = (slotState.cdSlopeEma === null) ? slope : ((slotState.cdSlopeEma * 0.75) + (slope * 0.25));
                                }
                            }
                        }
                    }
                    slotState.cdLastDeg = currentDeg;
                    slotState.cdLastMs = nowMs;
                    if (slotState.cdSlopeEma !== null && slotState.cdSlopeEma > 0.001) {
                        var remainingDeg = currentDeg;
                        if (slotState.cdDirection < 0) {
                            remainingDeg = 360 - currentDeg;
                        }
                        if (!isFinite(remainingDeg) || remainingDeg < 0) remainingDeg = 0;
                        var remainingSec = remainingDeg / slotState.cdSlopeEma;
                        var displayRaw = FormatDerivedCooldownSeconds(remainingSec);
                        var n = parseFloat(displayRaw);
                        if (isFinite(n)) {
                            if (n >= 1) {
                                var intVal = Math.ceil(n);
                                if (slotState.cdDisplayLock !== null && isFinite(slotState.cdDisplayLock)) {
                                    intVal = Math.min(intVal, slotState.cdDisplayLock);
                                }
                                slotState.cdDisplayLock = intVal;
                                cooldownText = String(intVal);
                                cooldownTextFromDerived = true;
                                cooldownTextDerivedNum = intVal;
                            } else {
                                if (slotState.cdDisplayLock !== null && isFinite(slotState.cdDisplayLock)) {
                                    n = Math.min(n, slotState.cdDisplayLock);
                                }
                                slotState.cdDisplayLock = n;
                                cooldownText = (Math.round(n * 10) / 10).toFixed(1);
                                cooldownTextFromDerived = true;
                                cooldownTextDerivedNum = n;
                            }
                        } else {
                            cooldownText = displayRaw;
                            cooldownTextFromDerived = true;
                            cooldownTextDerivedNum = parseFloat(displayRaw);
                        }
                    }
                }
            }

            if (cooldownTextFromDerived && isFinite(cooldownTextDerivedNum) && cooldownTextDerivedNum > 0 && cooldownTextDerivedNum < 1) {
                if (slotState.rapidRetriggerSuppressUntilMs > nowMs) {
                    cooldownText = "";
                }
            }

            if (cooldownText && cooldownText.length > 0) {
                if (mirrorCooldownText.text !== cooldownText) mirrorCooldownText.text = cooldownText;
                if (mirrorCooldownText.style.visibility !== "visible") mirrorCooldownText.style.visibility = "visible";
                isCooldownTextVisible = true;
            } else {
                if (mirrorCooldownText.style.visibility !== "collapse") mirrorCooldownText.style.visibility = "collapse";
                if (!isOnCooldown) slotState.lastProbeCooldownText = "";
            }
        } else {
            isCooldownTextVisible = false;
        }

        if (isOnCooldown) {
            var probeShort = slotState.lastProbeCooldownText || "-";
            var clipShort = maskClip || slotState.lastClip || "";
            var currentDegText = (currentDeg === null || currentDeg === undefined || !isFinite(currentDeg)) ? "-" : currentDeg.toFixed(2);
            var slopeText = (slotState.cdSlopeEma === null || slotState.cdSlopeEma === undefined || !isFinite(slotState.cdSlopeEma)) ? "-" : slotState.cdSlopeEma.toFixed(3);
            if (clipShort.length > 96) clipShort = clipShort.slice(0, 96) + "...";
            var cooldownDebugSig =
                String(source.key) + "|" +
                String(isVerticalCooldown ? 1 : 0) + "|" +
                currentDegText + "|" +
                String(slotState.cdDirection || 0) + "|" +
                slopeText + "|" +
                String(slotState.cdDisplayLock === null ? "-" : slotState.cdDisplayLock) + "|" +
                String(cooldownText || "-") + "|" +
                probeShort + "|" +
                clipShort;
            ItemMirrorCooldownDebugLogThrottled(
                cooldownDebugSig,
                "src=" + String(source.key) +
                " item=" + String(sourceItemClassName || "-") +
                " on=1 vertical=" + (isVerticalCooldown ? "1" : "0") +
                " deg=" + currentDegText +
                " dir=" + String(slotState.cdDirection || 0) +
                " slope=" + slopeText +
                " lock=" + (slotState.cdDisplayLock === null ? "-" : String(slotState.cdDisplayLock)) +
                " probe=" + probeShort +
                " text=" + (cooldownText || "-") +
                " clip=" + clipShort,
                nowMs
            );
        }

        // Trigger ready flash on true cooldown end, with cooldown-text fallback.
        var becameReadyFromState = wasOnCooldownBefore && !isOnCooldown;
        var becameReadyFromText = slotState.wasCooldownTextVisible && !isCooldownTextVisible && !isOnCooldown;
        if (becameReadyFromState || becameReadyFromText) {
            if (mirrorReadyOverlay) TriggerItemMirrorReadyFlash(mirrorReadyOverlay, source.key);
            slotState.lastCooldownEndMs = nowMs;
            slotState.rapidRetriggerSuppressUntilMs = 0;
        }
        slotState.wasCooldownTextVisible = isCooldownTextVisible;
        slotState.wasOnCooldown = !!isOnCooldown;

        if (!isOnCooldown) {
            slotState.cdLastDeg = null;
            slotState.cdLastMs = 0;
            slotState.cdSlopeEma = null;
            slotState.cdDirection = 0;
            slotState.cdDisplayLock = null;
            slotState.nextCooldownTextProbeMs = 0;
            slotState.lastProbeCooldownText = "";
        } else {
            State.itemMirror.fastModeUntilMs = nowMs + 500;
        }
    }

    function UpdateItemMirrorProbeMulti(root, cfg) {
        if (!IsCustomHudContextActive(root)) {
            if (State.itemMirror.displayMode !== "context_off") {
                if (!(cfg.QOLLOCK_DEV_CORE_ROOT_TEST_MODE === 1)) {
                ResetPassiveCooldownCustomRuntimeState(root);
                }
                RemoveItemMirrorOverlay(root);
                State.itemMirror.displayMode = "context_off";
            }
            return;
        }
        var passiveCooldownMode = ResolvePassiveCooldownMode(cfg);
        var enabled = IsPassiveCooldownAdvancedMode(passiveCooldownMode);
        if (!enabled) {
            if (State.itemMirror.displayMode === "disabled" && !State.itemMirror.probeWasEnabled) {
                return;
            }
            if (ITEM_MIRROR_PROBE_DEBUG && State.itemMirror.probeWasEnabled && State.itemMirror.displayMode !== "disabled") {
                $.Msg("[QOLLock][ItemMirrorProbe] disabled");
            }
            State.itemMirror.probeWasEnabled = false;
            State.itemMirror.probeLastScanMs = 0;
            State.itemMirror.probeLastSignature = "";
            RuntimeTaskReset("item_mirror_render");
            RuntimeTaskReset("item_mirror_scan");
            State.itemMirror.fastModeUntilMs = 0;
            if (!(cfg.QOLLOCK_DEV_CORE_ROOT_TEST_MODE === 1)) {
            ResetPassiveCooldownCustomRuntimeState(root);
            }
            if (State.itemMirror.displayMode !== "disabled") {
                RemoveItemMirrorOverlay(root);
                State.itemMirror.displayMode = "disabled";
            }
            return;
        }

        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        var renderIntervalMs = (nowMs < (State.itemMirror.fastModeUntilMs || 0))
            ? ITEM_MIRROR_RENDER_INTERVAL_MS_ACTIVE
            : ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE;
        if (!RuntimeTaskConsume("item_mirror_render", nowMs, renderIntervalMs)) {
            return;
        }

        State.itemMirror.probeWasEnabled = true;
        State.itemMirror.displayMode = "active";
        var sources = State.itemMirror.sources || [];
        var abilitiesContainer = GetCachedPanel("abilitiesContainer");
        if (!IsPanelValid(abilitiesContainer)) {
            abilitiesContainer = root.FindChildTraverse(PANEL_ID_ABILITIES_CONTAINER);
            SetCachedPanel("abilitiesContainer", abilitiesContainer);
        }
        var passiveInShop = abilitiesContainer && abilitiesContainer.BHasClass && abilitiesContainer.BHasClass("gShopOpen");
        var shopJustClosed = !!State.itemMirror.lastShopOpen && !passiveInShop;
        State.itemMirror.lastShopOpen = !!passiveInShop;

        if (passiveInShop) {
            EnsureItemMirrorOverlayMulti(root);
            var hiddenOverlay = GetCachedPanel("itemMirrorOverlay");
            if (hiddenOverlay && hiddenOverlay.style.visibility !== "collapse") {
                hiddenOverlay.style.visibility = "collapse";
            }
            return;
        }

        var sourcesValid = true;
        for (var i = 0; i < sources.length; i++) {
            if (!IsPanelValid(sources[i].ownerIcon) || !IsPanelValid(sources[i].iconContainer)) {
                sourcesValid = false;
                break;
            }
        }

        if (shopJustClosed) {
            sourcesValid = false;
            State.itemMirror.probeLastSignature = "";
            RuntimeTaskSetDelay("item_mirror_scan", nowMs, ITEM_MIRROR_PROBE_SCAN_MS_AFTER_SHOP);
        }

        if (!sourcesValid || sources.length === 0 || RuntimeTaskIsDue("item_mirror_scan", nowMs)) {
            State.itemMirror.probeLastScanMs = nowMs;
            var scan = BuildItemMirrorSourcesMulti(root, cfg);
            var signature = "modsContainers=" + scan.modsContainersCount + ";scan=" + scan.scannedCount + ";found=" + scan.matches.length + ";" + (scan.structureSummary || []).join(";");
            var signatureChanged = (signature !== State.itemMirror.probeLastSignature);
            var nextScanDelayMs = ITEM_MIRROR_PROBE_SCAN_MS;
            if (scan.matches.length > 0 && !signatureChanged && sourcesValid && sources.length > 0) {
                nextScanDelayMs = ITEM_MIRROR_PROBE_SCAN_MS_STABLE;
            }
            RuntimeTaskSetDelay("item_mirror_scan", nowMs, nextScanDelayMs);

            if (signatureChanged) {
                State.itemMirror.probeLastSignature = signature;
                if (ITEM_MIRROR_PROBE_DEBUG) {
                    if (scan.modsContainersCount === 0) {
                        $.Msg("[QOLLock][ItemMirrorProbe] ModsContainer not found");
                    } else if (scan.matches.length === 0) {
                        $.Msg("[QOLLock][ItemMirrorProbe] no configured mirror items found in owned slots (modsContainers=" + scan.modsContainersCount + ", scanned=" + scan.scannedCount + ")");
                    } else {
                        $.Msg("[QOLLock][ItemMirrorProbe] total matches=" + scan.matches.length + " (modsContainers=" + scan.modsContainersCount + ") -> " + scan.summary.join(" || "));
                    }
                }
            }

            sources = ReconcileItemMirrorSourcesMulti(scan.matches);
        }

        EnsureItemMirrorOverlayMulti(root);
        var mirrorOverlay = GetCachedPanel("itemMirrorOverlay");
        if (!mirrorOverlay) return;

        // Migrate mirror layout controls to legacy passive cooldown vars so existing configs still work.
        var basePassiveSize = 40;
        var pScale = Number(cfg.PASSIVE_COOLDOWN_SIZE) / basePassiveSize;
        if (!isFinite(pScale) || pScale <= 0) pScale = 1.0;
        if (pScale < 0.75) pScale = 0.75;
        if (pScale > 1.5) pScale = 1.5;
        var offsetX = Number(cfg.PASSIVE_COOLDOWN_X);
        if (!isFinite(offsetX)) offsetX = 0;
        var offsetY = Number(cfg.PASSIVE_COOLDOWN_Y);
        if (!isFinite(offsetY)) offsetY = -2;
        var rowOpacity = Number(cfg.PASSIVE_COOLDOWN_OPACITY);
        if (!isFinite(rowOpacity)) rowOpacity = 0.5;
        if (rowOpacity < 0) rowOpacity = 0;
        if (rowOpacity > 1) rowOpacity = 1;

        var layoutSig = [
            pScale.toFixed(3),
            String(offsetX),
            String(offsetY),
            rowOpacity.toFixed(2)
        ].join("|");
        if (layoutSig !== State.itemMirror.lastLayoutSig) {
            mirrorOverlay.style.preTransformScale2d = pScale.toFixed(3) + ", " + pScale.toFixed(3);
            mirrorOverlay.style.marginLeft = offsetX + "%";
            mirrorOverlay.style.marginTop = (-offsetY) + "%";
            State.itemMirror.lastLayoutSig = layoutSig;
        }
        var mirrorRow = GetCachedPanel("itemMirrorRow");
        var rowOpacityText = rowOpacity.toFixed(2);
        State.itemMirror.visualOpacityText = rowOpacityText;
        if (mirrorRow && (State.itemMirror.lastRowOpacityPanel !== mirrorRow || State.itemMirror.lastRowOpacityText !== rowOpacityText)) {
            SetPanelOpacitySafe(mirrorRow, rowOpacityText, 1.0);
            State.itemMirror.lastRowOpacityPanel = mirrorRow;
            State.itemMirror.lastRowOpacityText = rowOpacityText;
        }

        if (!sources || sources.length === 0) {
            if (mirrorOverlay.style.visibility !== "collapse") {
                mirrorOverlay.style.visibility = "collapse";
            }
            var emptySlots = State.cachedPanels.itemMirrorSlots || [];
            for (var es = 0; es < emptySlots.length; es++) {
                if (emptySlots[es] && IsPanelValid(emptySlots[es].icon)) {
                    emptySlots[es].icon.style.visibility = "collapse";
                }
            }
            State.itemMirror.slotStates = {};
            return;
        }

        if (mirrorOverlay.style.visibility !== "visible") {
            mirrorOverlay.style.visibility = "visible";
        }
        var activeKeys = {};
        for (var si = 0; si < sources.length; si++) {
            var slotObj = EnsureItemMirrorSlotMulti(si);
            if (!slotObj || !IsPanelValid(slotObj.icon)) continue;
            if (slotObj.icon.style.visibility !== "visible") slotObj.icon.style.visibility = "visible";
            slotObj.sourceKey = sources[si].key;
            activeKeys[sources[si].key] = true;
            SyncMirrorItemFromSourceMulti(slotObj, sources[si]);
        }

        var slots = State.cachedPanels.itemMirrorSlots || [];
        for (var hi = sources.length; hi < slots.length; hi++) {
            if (!slots[hi] || !IsPanelValid(slots[hi].icon)) continue;
            if (slots[hi].icon.style.visibility !== "collapse") slots[hi].icon.style.visibility = "collapse";
            if (slots[hi].cooldownText && slots[hi].cooldownText.style.visibility !== "collapse") slots[hi].cooldownText.style.visibility = "collapse";
        }

        var stateKeys = Object.keys(State.itemMirror.slotStates || {});
        for (var sk = 0; sk < stateKeys.length; sk++) {
            var key = stateKeys[sk];
            if (!activeKeys[key]) delete State.itemMirror.slotStates[key];
        }
    }

    function EnsureCompassOverlay(root) {
        var compassRoot = GetCachedPanel("compassRoot");
        if (!IsPanelValid(compassRoot)) {
            compassRoot = root.FindChildTraverse("QOLCompassRoot");
            if (!compassRoot) {
                var parent = GetGameplayHudPanel(root);
                if (!parent) return null;
                compassRoot = $.CreatePanel("Panel", parent, "QOLCompassRoot");
            }
            SetCachedPanel("compassRoot", compassRoot);
        }
        if (!compassRoot) return null;

        var compassBox = GetCachedPanel("compassBox");
        if (!IsPanelValid(compassBox)) {
            compassBox = compassRoot.FindChildTraverse("QOLCompassBox");
            if (!compassBox) {
                compassBox = $.CreatePanel("Panel", compassRoot, "QOLCompassBox");
            }
            SetCachedPanel("compassBox", compassBox);
        }

        var ticksContainer = GetCachedPanel("compassTicksContainer");
        if (!IsPanelValid(ticksContainer)) {
            ticksContainer = compassBox ? compassBox.FindChildTraverse("QOLCompassTicks") : null;
            if (!ticksContainer && compassBox) {
                ticksContainer = $.CreatePanel("Panel", compassBox, "QOLCompassTicks");
            }
            SetCachedPanel("compassTicksContainer", ticksContainer);
        }

        var needle = GetCachedPanel("compassNeedle");
        if (!IsPanelValid(needle)) {
            needle = compassBox ? compassBox.FindChildTraverse("QOLCompassNeedle") : null;
            if (!needle && compassBox) {
                needle = $.CreatePanel("Panel", compassBox, "QOLCompassNeedle");
            }
            SetCachedPanel("compassNeedle", needle);
        }

        var fadeLeft = GetCachedPanel("compassFadeLeft");
        if (!IsPanelValid(fadeLeft)) {
            fadeLeft = compassBox ? compassBox.FindChildTraverse("QOLCompassFadeLeft") : null;
            if (!fadeLeft && compassBox) {
                fadeLeft = $.CreatePanel("Panel", compassBox, "QOLCompassFadeLeft");
            }
            SetCachedPanel("compassFadeLeft", fadeLeft);
        }

        var fadeRight = GetCachedPanel("compassFadeRight");
        if (!IsPanelValid(fadeRight)) {
            fadeRight = compassBox ? compassBox.FindChildTraverse("QOLCompassFadeRight") : null;
            if (!fadeRight && compassBox) {
                fadeRight = $.CreatePanel("Panel", compassBox, "QOLCompassFadeRight");
            }
            SetCachedPanel("compassFadeRight", fadeRight);
        }

        var readout = GetCachedPanel("compassReadout");
        if (!IsPanelValid(readout)) {
            readout = compassRoot.FindChildTraverse("QOLCompassReadout");
            if (!readout) {
                readout = $.CreatePanel("Panel", compassRoot, "QOLCompassReadout");
            }
            SetCachedPanel("compassReadout", readout);
        }

        var degree = GetCachedPanel("compassDegree");
        if (!IsPanelValid(degree)) {
            degree = compassRoot.FindChildTraverse("QOLCompassDegree");
            if (!degree && readout) {
                degree = $.CreatePanel("Label", readout, "QOLCompassDegree");
            }
            SetCachedPanel("compassDegree", degree);
        }

        // Speed overlay — own root panel under the gameplay HUD so it isn't
        // trapped inside the 200px-wide compassRoot. Mirrors the zipBoost
        // pattern: independent panel, positioned by margins.
        var speedRoot = GetCachedPanel("speedRoot");
        if (!IsPanelValid(speedRoot)) {
            speedRoot = root.FindChildTraverse("QOLSpeedRoot");
            if (!speedRoot) {
                var parent = GetGameplayHudPanel(root);
                if (parent) {
                    speedRoot = $.CreatePanel("Panel", parent, "QOLSpeedRoot");
                }
            }
            SetCachedPanel("speedRoot", speedRoot);
        }
        if (speedRoot) {
            var speed = GetCachedPanel("compassSpeed");
            if (!IsPanelValid(speed)) {
                speed = speedRoot.FindChildTraverse("QOLSpeedLabel");
                if (!speed) {
                    speed = $.CreatePanel("Label", speedRoot, "QOLSpeedLabel");
                }
                SetCachedPanel("compassSpeed", speed);
            }
        }

        var ticks = State.cachedPanels.compassTicks || [];
        var rebuildTicks = (!ticks || ticks.length !== COMPASS_TICK_COUNT);
        if (!rebuildTicks) {
            for (var t = 0; t < ticks.length; t++) {
                if (!IsPanelValid(ticks[t])) {
                    rebuildTicks = true;
                    break;
                }
            }
        }
        if (rebuildTicks) {
            ticks = [];
            if (ticksContainer) {
                for (var i = 0; i < COMPASS_TICK_COUNT; i++) {
                    var tickId = "QOLCompassTick" + i;
                    var tick = ticksContainer.FindChildTraverse(tickId);
                    if (!tick) {
                        tick = $.CreatePanel("Panel", ticksContainer, tickId);
                        tick.AddClass("QOLCompassTick");
                    }
                    ticks.push(tick);
                }
            }
            State.cachedPanels.compassTicks = ticks;
            State.compass.tickClassSigs = [];
            State.compass.tickXTexts = [];
        }

        return compassRoot;
    }

    // Module-level regex constants to avoid recompilation every compass tick (50ms).
    var _RE_ROTATE3D = /rotate3d\s*\(\s*([+\-]?\d*\.?\d+)\s*,\s*([+\-]?\d*\.?\d+)\s*,\s*([+\-]?\d*\.?\d+)\s*,\s*([+\-]?\d*\.?\d+)\s*deg\s*\)/i;
    var _RE_ROTATE2D = /rotate(?:z|y)?\s*\(\s*([+\-]?\d*\.?\d+)\s*deg\s*\)/i;
    var _RE_ROTATE_LEGACY = /rotate3d\s*\(\s*[^,]+,\s*([+\-]?\d+(?:\.\d+)?)\s*deg\s*,/i;
    var _RE_DEG_GENERIC = /([+\-]?\d+(?:\.\d+)?)\s*deg/i;
    var _RE_POSITION_XY = /([+\-]?\d+(?:\.\d+)?)%\s*(?:,|\s+)\s*([+\-]?\d+(?:\.\d+)?)%/i;

    function ParseRotateTransformDegrees(transformText) {
        if (!transformText || transformText.length === 0) return null;
        var text = String(transformText);

        var rotate3dMatch = _RE_ROTATE3D.exec(text);
        if (rotate3dMatch && rotate3dMatch.length >= 5) {
            var angle3d = parseFloat(rotate3dMatch[4]);
            if (isFinite(angle3d)) return angle3d;
        }

        var rotate2dMatch = _RE_ROTATE2D.exec(text);
        if (rotate2dMatch && rotate2dMatch.length >= 2) {
            var angle2d = parseFloat(rotate2dMatch[1]);
            if (isFinite(angle2d)) return angle2d;
        }

        // Legacy format seen in some Panorama style strings.
        var legacyMatch = _RE_ROTATE_LEGACY.exec(text);
        if (legacyMatch && legacyMatch.length >= 2) {
            var legacyVal = parseFloat(legacyMatch[1]);
            if (isFinite(legacyVal)) return legacyVal;
        }

        // Last-resort: any degrees token in transform text.
        var genericDegMatch = _RE_DEG_GENERIC.exec(text);
        if (genericDegMatch && genericDegMatch.length >= 2) {
            var genericVal = parseFloat(genericDegMatch[1]);
            if (isFinite(genericVal)) return genericVal;
        }

        return null;
    }

    function ParsePlainRotateDegrees(rotateText) {
        if (!rotateText || rotateText.length === 0) return null;
        var match = _RE_DEG_GENERIC.exec(String(rotateText));
        if (!match || match.length < 2) return null;
        var val = parseFloat(match[1]);
        return isFinite(val) ? val : null;
    }

    function ReadPanelHeadingDegrees(panel) {
        if (!panel) return null;

        var preRotate = "";
        try {
            if (panel.style && typeof panel.style.preTransformRotate2d === "string") {
                preRotate = panel.style.preTransformRotate2d;
            }
        } catch(e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        var preRotateVal = ParsePlainRotateDegrees(preRotate);
        if (preRotateVal !== null) return NormalizeDegrees360(preRotateVal);

        // Read-only fallback: base HUD may still author minimap heading via transform.
        var transformText = "";
        try {
            if (panel.style && typeof panel.style.transform === "string") {
                transformText = panel.style.transform;
            }
        } catch(e1) { QOL_WARN("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        var transformVal = ParseRotateTransformDegrees(transformText);
        if (transformVal !== null) return NormalizeDegrees360(transformVal);

        if (panel.GetAttributeString) {
            var styleAttr = "";
            try { styleAttr = panel.GetAttributeString("style", ""); } catch (e2) { styleAttr = ""; }
            transformVal = ParseRotateTransformDegrees(styleAttr);
            if (transformVal !== null) return NormalizeDegrees360(transformVal);
        }

        return null;
    }

    var _posResultScratch = { x: 0, y: 0 };

    function ParsePositionXYPercent(positionText) {
        if (!positionText || positionText.length === 0) return null;
        var match = _RE_POSITION_XY.exec(positionText);
        if (!match || match.length < 3) return null;
        var x = parseFloat(match[1]);
        var y = parseFloat(match[2]);
        if (!isFinite(x) || !isFinite(y)) return null;
        _posResultScratch.x = x;
        _posResultScratch.y = y;
        return _posResultScratch;
    }

    var NormalizeDegrees360 = QOL_UTILS_LOADED ? QOL_UTILS.NormalizeDegrees360 : function(rawDeg) {
        var out = rawDeg % 360;
        if (out < 0) out += 360;
        if (out >= 360) out -= 360;
        return out;
    };

    var NormalizeDegrees180 = QOL_UTILS_LOADED ? QOL_UTILS.NormalizeDegrees180 : function(rawDeg) {
        var out = NormalizeDegrees360(rawDeg);
        if (out > 180) out -= 360;
        return out;
    };

    var ShortestDegreesDelta = QOL_UTILS_LOADED ? QOL_UTILS.ShortestDegreesDelta : function(fromDeg, toDeg) {
        var from = NormalizeDegrees180(fromDeg);
        var to = NormalizeDegrees180(toDeg);
        var delta = to - from;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        return delta;
    };

    function CanReuseMinimapHeadingSnapshot(nowMs, aggressiveScan) {
        var now = Number(nowMs) || 0;
        if (now <= 0 || State.minimapHeadingSnapshotMs !== now) return false;
        return !!State.minimapHeadingSnapshotAggressive || aggressiveScan !== true;
    }

    function StoreMinimapHeadingSnapshot(nowMs, aggressiveScan, mainImage, playerPanel, heading) {
        State.minimapHeadingSnapshotMs = Number(nowMs) || 0;
        State.minimapHeadingSnapshotAggressive = aggressiveScan === true;
        State.minimapHeadingSnapshotMainImage = IsPanelValid(mainImage) ? mainImage : null;
        State.minimapHeadingSnapshotPlayerPanel = IsPanelValid(playerPanel) ? playerPanel : null;
        State.minimapHeadingSnapshotHeading = heading;
    }

    function GetLocalPlayerHeadingDegrees(root, nowMs, aggressiveScan) {
        if (CanReuseMinimapHeadingSnapshot(nowMs, aggressiveScan)) {
            return State.minimapHeadingSnapshotHeading;
        }
        var mainImage = FindLocalMinimapMainImage(root, nowMs, aggressiveScan === true);
        var heading = ReadPanelHeadingDegrees(mainImage);
        var playerPanel = GetCachedPanel("minimapLocalPlayerPanel");
        if (heading !== null) {
            StoreMinimapHeadingSnapshot(nowMs, aggressiveScan === true, mainImage, playerPanel, heading);
            return heading;
        }

        playerPanel = FindLocalMinimapPlayerPanel(root, nowMs, aggressiveScan === true);
        heading = ReadPanelHeadingDegrees(playerPanel);
        if (heading !== null) {
            StoreMinimapHeadingSnapshot(nowMs, aggressiveScan === true, mainImage, playerPanel, heading);
            return heading;
        }

        StoreMinimapHeadingSnapshot(nowMs, aggressiveScan === true, mainImage, playerPanel, null);
        return null;
    }

    function FindLocalMinimapMainImage(root, nowMs, aggressiveScan) {
        if (CanReuseMinimapHeadingSnapshot(nowMs, aggressiveScan) && IsPanelValid(State.minimapHeadingSnapshotMainImage)) {
            return State.minimapHeadingSnapshotMainImage;
        }
        var cached = GetCachedPanel("minimapLocalMainImage");
        if (IsPanelValid(cached)) {
            var parent = cached.GetParent ? cached.GetParent() : null;
            if (PanelHasAllClasses(parent, ["active", "player", "client_cone_fov", "enemy"]) ||
                hasClassInHierarchy(cached, "localplayer")) {
                return cached;
            }
        }

        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var scanCooldownMs = aggressiveScan ? MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_FAST_MS : MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_MS;
        if (now < (State.minimapLocalMainImageNextScanMs || 0)) {
            return null;
        }

        var preferredPlayer = FindLocalMinimapPlayerPanel(root, now, aggressiveScan === true);
        if (preferredPlayer) {
            var preferredImage = preferredPlayer.FindChildTraverse("MainImage");
            if (preferredImage) {
                SetCachedPanel("minimapLocalMainImage", preferredImage);
                State.minimapLocalMainImageNextScanMs = 0;
                return preferredImage;
            }
        }

        var locals = root.FindChildrenWithClassTraverse("localplayer") || [];
        for (var i = 0; i < locals.length; i++) {
            var p = locals[i];
            if (!p) continue;
            var img = p.FindChildTraverse("MainImage");
            if (img) {
                SetCachedPanel("minimapLocalMainImage", img);
                State.minimapLocalMainImageNextScanMs = 0;
                return img;
            }
        }

        SetCachedPanel("minimapLocalMainImage", null);
        State.minimapLocalMainImageNextScanMs = now + scanCooldownMs;
        return null;
    }

    function FindLocalMinimapPlayerPanel(root, nowMs, aggressiveScan) {
        if (CanReuseMinimapHeadingSnapshot(nowMs, aggressiveScan) && IsPanelValid(State.minimapHeadingSnapshotPlayerPanel)) {
            return State.minimapHeadingSnapshotPlayerPanel;
        }
        var cached = GetCachedPanel("minimapLocalPlayerPanel");
        if (IsPanelValid(cached)) {
            if (PanelHasAllClasses(cached, ["active", "player", "client_cone_fov", "enemy"]) ||
                (cached.BHasClass && cached.BHasClass("player") && hasClassInHierarchy(cached, "localplayer"))) {
                return cached;
            }
        }

        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var scanCooldownMs = aggressiveScan ? MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_FAST_MS : MINIMAP_LOCAL_PLAYER_SCAN_COOLDOWN_MS;
        if (now < (State.minimapLocalPlayerPanelNextScanMs || 0)) {
            return null;
        }

        var cones = root.FindChildrenWithClassTraverse("client_cone_fov") || [];
        for (var i = 0; i < cones.length; i++) {
            var cp = cones[i];
            if (!cp) continue;
            if (PanelHasAllClasses(cp, ["active", "player", "client_cone_fov", "enemy"])) {
                SetCachedPanel("minimapLocalPlayerPanel", cp);
                State.minimapLocalPlayerPanelNextScanMs = 0;
                return cp;
            }
        }

        for (var j = 0; j < cones.length; j++) {
            var cp2 = cones[j];
            if (!cp2) continue;
            if (PanelHasAllClasses(cp2, ["active", "player", "client_cone_fov"])) {
                SetCachedPanel("minimapLocalPlayerPanel", cp2);
                State.minimapLocalPlayerPanelNextScanMs = 0;
                return cp2;
            }
        }

        var locals = root.FindChildrenWithClassTraverse("localplayer") || [];
        for (var k = 0; k < locals.length; k++) {
            var p = locals[k];
            if (!p) continue;
            if (p.BHasClass && p.BHasClass("player")) {
                SetCachedPanel("minimapLocalPlayerPanel", p);
                State.minimapLocalPlayerPanelNextScanMs = 0;
                return p;
            }
        }

        SetCachedPanel("minimapLocalPlayerPanel", null);
        State.minimapLocalPlayerPanelNextScanMs = now + scanCooldownMs;
        return null;
    }

    function FindMinimapRotateTarget(root) {
        var cached = GetCachedPanel("minimapRotateTarget");
        if (IsPanelValid(cached)) {
            return cached;
        }

        var target = null;
        if (root && root.FindChildTraverse) {
            target = root.FindChildTraverse(PANEL_ID_MINIMAP);
            if (!target) target = root.FindChildTraverse("minimap_container");
            if (!target) target = root.FindChildTraverse("minimap_persp");
            if (!target) target = root.FindChildTraverse("map_render");
        }
        SetCachedPanel("minimapRotateTarget", target);
        return target;
    }

    function FindMinimapFlipClassTarget(root) {
        var cached = GetCachedPanel("minimapFlipClassTarget");
        if (IsPanelValid(cached)) {
            return cached;
        }

        var target = null;
        var rotateTarget = FindMinimapRotateTarget(root);
        if (IsPanelValid(rotateTarget)) {
            if (rotateTarget.id === PANEL_ID_MINIMAP) {
                target = rotateTarget;
            } else if (rotateTarget.FindChildTraverse) {
                target = rotateTarget.FindChildTraverse(PANEL_ID_MINIMAP);
            }
        }

        if (!IsPanelValid(target) && root && root.FindChildTraverse) {
            target = root.FindChildTraverse("HudMinimapContainer");
        }

        if (!IsPanelValid(target) && IsPanelValid(rotateTarget)) {
            target = rotateTarget;
        }
        SetCachedPanel("minimapFlipClassTarget", target);
        return target;
    }

    function ResetMinimapRotateTracking(nowMs, appliedDeg) {
        var resolvedDeg = Number(appliedDeg);
        if (!isFinite(resolvedDeg)) resolvedDeg = 0;
        State.minimapRotateLastDeg = resolvedDeg;
        State.minimapRotateSmoothedDeg = resolvedDeg;
        State.minimapRotateLastUpdateMs = nowMs;
        State.minimapRotateLastHeadingDeg = null;
        State.minimapRotateLastHeadingMs = 0;
        State.minimapRotateHeadingVelDegPerSec = 0;
        State.minimapRotateLastValidHeadingDeg = null;
        State.minimapRotateLastValidHeadingMs = 0;
    }

    function ApplyStaticMinimapRotation(root, nowMs, targetDeg) {
        var target = FindMinimapRotateTarget(root);
        if (!IsPanelValid(target)) return;

        var resolvedDeg = Number(targetDeg);
        if (!isFinite(resolvedDeg)) resolvedDeg = 0;
        var roundedDeg = Math.round(resolvedDeg * 100) / 100;
        if (State.minimapRotateLastDeg !== roundedDeg) {
            target.style.preTransformRotate2d = roundedDeg.toFixed(2) + "deg";
        }
        ResetMinimapRotateTracking(nowMs, roundedDeg);
    }

    function UpdateMinimapRotateWithPlayer(root, cfg, nowMsHint) {
        if (!root || !cfg) return;
        var nowMs = Number(nowMsHint);
        if (!isFinite(nowMs) || nowMs <= 0) nowMs = Date.now ? Date.now() : (new Date()).getTime();

        var enabled = IsCfgEnabled(cfg, "MINIMAP_ROTATE_WITH_PLAYER");
        var staticFlipEnabled = IsCfgEnabled(cfg, "MINIMAP_FLIP");
        var flipClassTarget = FindMinimapFlipClassTarget(root);
        if (!enabled) {
            ApplyStaticMinimapRotation(root, nowMs, staticFlipEnabled ? 180 : 0);
            SetPanelClassCached(flipClassTarget, State.minimapFlipClassCache, "qol_minimap_flip_active", staticFlipEnabled);
            return;
        }

        SetPanelClassCached(flipClassTarget, State.minimapFlipClassCache, "qol_minimap_flip_active", false);

        var target = FindMinimapRotateTarget(root);
        if (!IsPanelValid(target)) return;

        var heading360 = GetLocalPlayerHeadingDegrees(root, nowMs, true);
        var headingIsLive = true;
        if (heading360 === null) {
            var heldHeadingRaw = State.minimapRotateLastValidHeadingDeg;
            var heldHeading = Number(heldHeadingRaw);
            var heldAtMs = Number(State.minimapRotateLastValidHeadingMs) || 0;
            if (heldHeadingRaw !== null && heldHeadingRaw !== undefined && isFinite(heldHeading) && (nowMs - heldAtMs) <= MINIMAP_ROTATE_HEADING_HOLD_MS) {
                heading360 = NormalizeDegrees360(heldHeading);
                headingIsLive = false;
            } else {
                State.minimapRotateLastUpdateMs = nowMs;
                return;
            }
        } else {
            State.minimapRotateLastValidHeadingDeg = heading360;
            State.minimapRotateLastValidHeadingMs = nowMs;
        }

        var headingVelDegPerSec = Number(State.minimapRotateHeadingVelDegPerSec);
        if (!isFinite(headingVelDegPerSec)) headingVelDegPerSec = 0;
        if (headingIsLive) {
            var prevHeading = State.minimapRotateLastHeadingDeg;
            var prevHeadingMs = Number(State.minimapRotateLastHeadingMs) || 0;
            if (isFinite(prevHeading) && prevHeadingMs > 0) {
                var dtHeadingSec = (nowMs - prevHeadingMs) / 1000.0;
                if (isFinite(dtHeadingSec) && dtHeadingSec > 0.001 && dtHeadingSec < 0.5) {
                    var headingDelta = ShortestDegreesDelta(prevHeading, heading360);
                    var headingVelInstant = headingDelta / dtHeadingSec;
                    if (!isFinite(headingVelDegPerSec) || Math.abs(headingVelDegPerSec) < 0.001) {
                        headingVelDegPerSec = headingVelInstant;
                    } else {
                        headingVelDegPerSec = headingVelDegPerSec + ((headingVelInstant - headingVelDegPerSec) * MINIMAP_ROTATE_VEL_FILTER_ALPHA);
                    }
                }
            }
            State.minimapRotateLastHeadingDeg = heading360;
            State.minimapRotateLastHeadingMs = nowMs;
        } else {
            headingVelDegPerSec *= 0.88;
            if (Math.abs(headingVelDegPerSec) < 0.01) headingVelDegPerSec = 0;
        }
        State.minimapRotateHeadingVelDegPerSec = headingVelDegPerSec;

        var headingPrediction = headingVelDegPerSec * MINIMAP_ROTATE_PREDICT_SEC;
        if (!isFinite(headingPrediction)) headingPrediction = 0;
        if (headingPrediction > MINIMAP_ROTATE_PREDICT_MAX_DEG) headingPrediction = MINIMAP_ROTATE_PREDICT_MAX_DEG;
        if (headingPrediction < -MINIMAP_ROTATE_PREDICT_MAX_DEG) headingPrediction = -MINIMAP_ROTATE_PREDICT_MAX_DEG;
        var predictedHeading = NormalizeDegrees360(heading360 + headingPrediction);

        // Deadlock heading appears to be east-aligned (right) at 0deg; offset to keep forward as screen-up.
        var targetDeg = NormalizeDegrees180(-(predictedHeading + MINIMAP_ROTATE_NORTH_OFFSET_DEG));
        if (State.minimapRotateSmoothedDeg === null || !isFinite(State.minimapRotateSmoothedDeg)) {
            State.minimapRotateSmoothedDeg = targetDeg;
            State.minimapRotateLastUpdateMs = nowMs;
        } else {
            var dtSec = (nowMs - State.minimapRotateLastUpdateMs) / 1000.0;
            if (!isFinite(dtSec) || dtSec <= 0) dtSec = COMPASS_INTERVAL_SEC;
            if (dtSec > 0.25) dtSec = 0.25;
            if (dtSec < 0.001) dtSec = 0.001;

            var delta = ShortestDegreesDelta(State.minimapRotateSmoothedDeg, targetDeg);
            var absDelta = Math.abs(delta);
            var absVel = Math.abs(headingVelDegPerSec);
            var deadzoneDeg = (absVel > 120.0) ? MINIMAP_ROTATE_DEADZONE_MOVING_DEG : MINIMAP_ROTATE_DEADZONE_BASE_DEG;
            if (absDelta <= deadzoneDeg) {
                State.minimapRotateSmoothedDeg = targetDeg;
            } else {
                var tauSec = (absDelta >= MINIMAP_ROTATE_FAST_DELTA_DEG || absVel > 220.0)
                    ? MINIMAP_ROTATE_TAU_FAST_SEC
                    : MINIMAP_ROTATE_TAU_SLOW_SEC;
                var alpha = 1.0 - Math.exp(-dtSec / tauSec);
                if (!isFinite(alpha) || alpha <= 0) alpha = 0.05;
                if (alpha > 1.0) alpha = 1.0;

                var step = delta * alpha;
                var maxStep = MINIMAP_ROTATE_MAX_SPEED_DEG_PER_SEC * dtSec;
                if (!isFinite(maxStep) || maxStep <= 0) {
                    maxStep = MINIMAP_ROTATE_MAX_SPEED_DEG_PER_SEC * COMPASS_INTERVAL_SEC;
                }
                if (Math.abs(step) > maxStep) {
                    step = (step > 0) ? maxStep : -maxStep;
                }
                if (Math.abs(step) > absDelta) {
                    step = delta;
                }
                State.minimapRotateSmoothedDeg = NormalizeDegrees180(State.minimapRotateSmoothedDeg + step);
            }
            State.minimapRotateLastUpdateMs = nowMs;
        }

        var roundedDeg = Math.round(State.minimapRotateSmoothedDeg * 100) / 100;
        if (State.minimapRotateLastDeg === roundedDeg) return;

        target.style.preTransformRotate2d = roundedDeg.toFixed(2) + "deg";
        State.minimapRotateLastDeg = roundedDeg;
    }

    function UpdateCompassTicks(heading360, boxWidthPx, stretchXFactor, stretchYFactor) {
        var ticks = State.cachedPanels.compassTicks || [];
        if (!ticks || ticks.length === 0) return;

        var stepsPerTurn = Math.round(360 / COMPASS_TICK_STEP_DEG); // 16 for 22.5deg
        var centerIndex = Math.floor(COMPASS_TICK_COUNT / 2);
        var unit = heading360 / COMPASS_TICK_STEP_DEG;
        var base = Math.floor(unit);
        var frac = unit - base;
        var boxWidth = Number(boxWidthPx);
        if (!isFinite(boxWidth) || boxWidth <= 0) boxWidth = 200;
        var stretchX = Number(stretchXFactor);
        if (!isFinite(stretchX) || stretchX <= 0) stretchX = 1.0;
        var stretchY = Number(stretchYFactor);
        if (!isFinite(stretchY) || stretchY <= 0) stretchY = 1.0;

        var halfWidth = boxWidth * 0.5;
        var spacing = COMPASS_TICK_SPACING_PX * stretchX;

        for (var i = 0; i < ticks.length; i++) {
            var tick = ticks[i];
            if (!tick) continue;

            var rel = i - centerIndex;
            var tickUnit = base + rel;
            var tickStepIndex = ((tickUnit % stepsPerTurn) + stepsPerTurn) % stepsPerTurn;

            var isMajor45 = (tickStepIndex % 2) === 0;
            var isCardinal = (tickStepIndex % 4) === 0;

            var tickWidth = isCardinal ? 3 : 2;
            var baseTickHeight = isCardinal ? 34 : (isMajor45 ? 24 : 16);
            var tickHeight = Math.max(4, Math.round(baseTickHeight * stretchY));
            var classSig = (isMajor45 ? "1" : "0") + "|" + (isCardinal ? "1" : "0") + "|" + String(tickHeight);
            if (State.compass.tickClassSigs[i] !== classSig) {
                tick.SetHasClass("Major", isMajor45);
                tick.SetHasClass("Cardinal", isCardinal);
                tick.style.height = tickHeight + "px";
                State.compass.tickClassSigs[i] = classSig;
            }

            var x = (halfWidth - (tickWidth * 0.5)) + ((rel - frac) * spacing);
            var xText = x.toFixed(2) + "px";
            if (State.compass.tickXTexts[i] !== xText) {
                tick.style.x = xText;
                State.compass.tickXTexts[i] = xText;
            }
        }
    }

    function ResetCompassRuntimeState() {
        State.compass.lastDegreeText = "";
        State.compass.layoutSig = "";
        State.compass.speedOffsetSig = "";
        State.compass.nextSpeedSampleMs = 0;

        State.compass.lastSpeedValueText = "--";
        State.compass.lastPosX = null;
        State.compass.lastPosY = null;
        State.compass.lastPosTimeMs = 0;
        State.compass.speedSmoothed = null;
        State.compass.speedDisplay = null;
        State.compass.speedSamples = null;
        State.compass.tickClassSigs = [];
        State.compass.tickXTexts = [];
    }

    function UpdateCompassOverlay(root, nowMsHint) {
        if (!IsCustomHudContextActive(root)) {
            var existing = GetCachedPanel("compassRoot");
            if (!IsPanelValid(existing) && root && root.FindChildTraverse) {
                existing = root.FindChildTraverse("QOLCompassRoot");
                SetCachedPanel("compassRoot", existing);
            }
            if (IsPanelValid(existing)) {
                if (existing.style.visibility !== "collapse") existing.style.visibility = "collapse";
            }
            var _srNoCtx = GetCachedPanel("speedRoot");
            if (IsPanelValid(_srNoCtx) && _srNoCtx.style.visibility !== "collapse") _srNoCtx.style.visibility = "collapse";
            ResetCompassRuntimeState();
            return;
        }
        var compassRoot = EnsureCompassOverlay(root);
        if (!compassRoot) return;

        var showCompass = State.compass.enabled;
        var showSpeed = State.compass.showSpeed;

        if (!showCompass && !showSpeed) {
            if (compassRoot.style.visibility !== "collapse") compassRoot.style.visibility = "collapse";
            var _sr0 = GetCachedPanel("speedRoot");
            if (IsPanelValid(_sr0) && _sr0.style.visibility !== "collapse") _sr0.style.visibility = "collapse";
            ResetCompassRuntimeState();
            return;
        }

        if (IsConnectedToHideout(root)) {
            if (compassRoot.style.visibility !== "collapse") compassRoot.style.visibility = "collapse";
            var _sr1 = GetCachedPanel("speedRoot");
            if (IsPanelValid(_sr1) && _sr1.style.visibility !== "collapse") _sr1.style.visibility = "collapse";
            ResetCompassRuntimeState();
            return;
        }

        if (compassRoot.style.visibility !== (showCompass ? "visible" : "collapse")) compassRoot.style.visibility = (showCompass ? "visible" : "collapse");
        
        var compassBox = GetCachedPanel("compassBox");
        if (compassBox) {
            compassBox.style.visibility = showCompass ? "visible" : "collapse";
        }
        var scale = Number(State.compass.scale);
        if (!isFinite(scale)) scale = 100;
        if (scale < 50) scale = 50;
        if (scale > 200) scale = 200;
        var stretchX = Number(State.compass.stretchX);
        if (!isFinite(stretchX)) stretchX = 100;
        if (stretchX < 50) stretchX = 50;
        if (stretchX > 200) stretchX = 200;
        var stretchY = Number(State.compass.stretchY);
        if (!isFinite(stretchY)) stretchY = 100;
        if (stretchY < 50) stretchY = 50;
        if (stretchY > 200) stretchY = 200;
        var offsetX = Number(State.compass.offsetX);
        if (!isFinite(offsetX)) offsetX = 0;
        if (offsetX < -2000) offsetX = -2000;
        if (offsetX > 2000) offsetX = 2000;
        var offsetY = Number(State.compass.offsetY);
        if (!isFinite(offsetY)) offsetY = 120;
        if (offsetY < -1000) offsetY = -1000;
        if (offsetY > 300) offsetY = 300;

        var compassBaselineY = Number(_defCfg.COMPASS_Y_OFFSET);
        if (!isFinite(compassBaselineY)) compassBaselineY = 120;
        var appliedCompassOffsetY = (2 * compassBaselineY) - offsetY;
        var marginTopText = Math.round(appliedCompassOffsetY) + "px";
        var marginLeftText = Math.round(offsetX) + "px";
        var uniformScale = (scale / 100).toFixed(3);
        var scaleText = uniformScale + ", " + uniformScale;
        var compassBox = GetCachedPanel("compassBox");
        if (!IsPanelValid(compassBox)) {
            compassBox = compassRoot.FindChildTraverse("QOLCompassBox");
            SetCachedPanel("compassBox", compassBox);
        }
        var boxWidth = Math.round(200 * (stretchX / 100));
        var boxHeight = Math.round(50 * (stretchY / 100));
        if (boxWidth < 100) boxWidth = 100;
        if (boxHeight < 25) boxHeight = 25;
        var boxWidthText = boxWidth + "px";
        var boxHeightText = boxHeight + "px";
        var layoutSig = marginTopText + "|" + marginLeftText + "|" + scaleText + "|" +
            boxWidthText + "|" + boxHeightText + "|" + (showCompass ? "1" : "0") + "|" +
            (showSpeed ? "1" : "0");
        if (layoutSig !== State.compass.layoutSig) {
            if (compassRoot.style.marginTop !== marginTopText) compassRoot.style.marginTop = marginTopText;
            if (compassRoot.style.marginLeft !== marginLeftText) compassRoot.style.marginLeft = marginLeftText;
            if (compassRoot.style.preTransformScale2d !== scaleText) compassRoot.style.preTransformScale2d = scaleText;
            if (compassRoot.style.width !== boxWidthText) compassRoot.style.width = boxWidthText;
            compassRoot.style.height = "fit-children";
            compassRoot.style.overflow = "noclip";

            if (compassBox) {
                if (compassBox.style.width !== boxWidthText) compassBox.style.width = boxWidthText;
                if (compassBox.style.height !== boxHeightText) compassBox.style.height = boxHeightText;
                compassBox.style.visibility = showCompass ? "visible" : "collapse";
            }

            var readout = GetCachedPanel("compassReadout");
            if (readout) {
                readout.style.width = "100%";
                readout.style.height = "40px";
                readout.style.flowChildren = "none";
                readout.style.overflow = "noclip";
            }
            State.compass.layoutSig = layoutSig;
        }

        var degreeLabel = GetCachedPanel("compassDegree");
        if (!IsPanelValid(degreeLabel)) {
            degreeLabel = compassRoot.FindChildTraverse("QOLCompassDegree");
            SetCachedPanel("compassDegree", degreeLabel);
        }
        var speedLabel = GetCachedPanel("compassSpeed");
        if (!IsPanelValid(speedLabel)) {
            speedLabel = compassRoot.FindChildTraverse("QOLCompassSpeed");
            SetCachedPanel("compassSpeed", speedLabel);
        }
        if (degreeLabel) {
            // Degrees take the LEFT half of the readout when speed shares the
            // row, and the full centered width when the compass owns the row
            // alone. (Both labels use ignore-parent-flow, so equal full widths
            // would stack on top of each other — hence the 50% split.)
            degreeLabel.style.width = showSpeed ? "50%" : "100%";
            degreeLabel.style.textAlign = showSpeed ? "left" : "center";
            degreeLabel.style.horizontalAlign = "left";
            degreeLabel.style.verticalAlign = "center";
            degreeLabel.style.visibility = showCompass ? "visible" : "collapse";
        }
        if (speedLabel) {
            var speedRoot = GetCachedPanel("speedRoot");
            var speedVisibility = showSpeed ? "visible" : "collapse";
            if (speedLabel.style.visibility !== speedVisibility) speedLabel.style.visibility = speedVisibility;
            // With the compass on, speed sits in the RIGHT half of the readout
            // row (degrees take the left half) and a few px lower; when speed is
            // alone it's full-width screen-centered. The speed root is sized to
            // the box width and centered on it, so "right half" lines up with the
            // box's right half — no boxWidth/2 margin shift needed.
            speedLabel.style.width = showCompass ? "50%" : "100%";
            speedLabel.style.textAlign = showCompass ? "right" : "center";
            speedLabel.style.horizontalAlign = showCompass ? "right" : "center";
            speedLabel.style.verticalAlign = "center";
            var speedOffsetX = Number(State.compass.speedOffsetX);
            if (!isFinite(speedOffsetX)) speedOffsetX = 0;
            if (speedOffsetX < -2000) speedOffsetX = -2000;
            if (speedOffsetX > 2000) speedOffsetX = 2000;
            var speedOffsetY = Number(State.compass.speedOffsetY);
            if (!isFinite(speedOffsetY)) speedOffsetY = 0;
            if (speedOffsetY < -2000) speedOffsetY = -2000;
            if (speedOffsetY > 2000) speedOffsetY = 2000;
            if (speedRoot) {
                // Speed root is a standalone panel under the gameplay HUD
                // (sibling of compassRoot), positioned by margins so it can
                // roam the entire screen — no 200px parent clip box.
                if (speedRoot.style.visibility !== speedVisibility) speedRoot.style.visibility = speedVisibility;
                // Speed root overlaps the compass box horizontally (same width,
                // centered on it), so its right half maps to the box's right
                // half. Vertically it sits below the box, a touch under the
                // degree readout (box bottom + readout margin 4 + 10px nudge) so
                // the two numbers don't share a baseline. Compass off: screen-
                // centered at the baseline, decoupled from the compass offset.
                var speedRootWidth = (showCompass ? boxWidth : 200) + "px";
                var speedBaseX = showCompass ? offsetX : 0;
                var speedBaseY = showCompass ? (appliedCompassOffsetY + boxHeight + 14) : compassBaselineY;
                var speedMarginLeft = Math.round(speedBaseX + speedOffsetX) + "px";
                var speedMarginTop  = Math.round(speedBaseY - speedOffsetY) + "px";
                // Base anchor + width in the sig so the speed re-follows the
                // compass when its offset/stretch changes (not just speed sliders).
                var speedLayoutSig = Math.round(speedOffsetX) + "|" + Math.round(speedOffsetY) + "|" + (showCompass ? "1" : "0") + "|" + Math.round(speedBaseX) + "|" + Math.round(speedBaseY) + "|" + speedRootWidth;
                if (State.compass.speedOffsetSig !== speedLayoutSig) {
                    if (speedRoot.style.width !== speedRootWidth) speedRoot.style.width = speedRootWidth;
                    if (speedRoot.style.marginLeft !== speedMarginLeft) speedRoot.style.marginLeft = speedMarginLeft;
                    if (speedRoot.style.marginTop !== speedMarginTop) speedRoot.style.marginTop = speedMarginTop;
                    State.compass.speedOffsetSig = speedLayoutSig;
                }
            }
            if (!showSpeed && speedLabel.text !== "") speedLabel.text = "";
        }


        var nowMs = Number(nowMsHint);
        if (!isFinite(nowMs) || nowMs <= 0) nowMs = Date.now ? Date.now() : (new Date()).getTime();
        var heading360 = GetLocalPlayerHeadingDegrees(root, nowMs);

        if (showCompass) {
            if (heading360 === null) {
                if (degreeLabel && degreeLabel.text !== "N/A") degreeLabel.text = "N/A";
            } else {
                UpdateCompassTicks(heading360, boxWidth, (stretchX / 100), (stretchY / 100));
                if (degreeLabel) {
                    var degreeText = String(Math.round(heading360)) + "\u00B0";
                    if (degreeText !== State.compass.lastDegreeText) {
                        degreeLabel.text = degreeText;
                        State.compass.lastDegreeText = degreeText;
                    }
                }
            }
        }

        if (!showSpeed) {
            return;
        }

        var speedValueText = State.compass.lastSpeedValueText || "--";
        if (nowMs >= (Number(State.compass.nextSpeedSampleMs) || 0)) {
            speedValueText = "--";
            var playerPanel = IsPanelValid(State.minimapHeadingSnapshotPlayerPanel) ? State.minimapHeadingSnapshotPlayerPanel : FindLocalMinimapPlayerPanel(root, nowMs);
            if (playerPanel) {
                var positionText = "";
                if (playerPanel.style && typeof playerPanel.style.position === "string") {
                    positionText = playerPanel.style.position;
                }
                if ((!positionText || positionText.length === 0) && playerPanel.GetAttributeString) {
                    positionText = playerPanel.GetAttributeString("style", "");
                }
                var pos = ParsePositionXYPercent(positionText);
                if (pos) {
                    // Push (t, x, y) into a flat ring buffer and evict samples
                    // older than the window. A long teleport/respawn jump is
                    // rejected later by the < 10000 sanity clamp on the fitted
                    // speed, so it never corrupts more than one stale window.
                    var samples = State.compass.speedSamples;
                    if (!samples) { samples = []; State.compass.speedSamples = samples; }
                    samples.push(nowMs, pos.x, pos.y);
                    var cutoff = nowMs - COMPASS_SPEED_WINDOW_MS;
                    var drop = 0;
                    while (drop + 3 < samples.length && samples[drop] < cutoff) drop += 3;
                    if (drop > 0) samples.splice(0, drop);

                    // Least-squares fit of x(t) and y(t) over the window. The
                    // slope (vx, vy) in %/sec is the noise-rejecting velocity;
                    // identical-position points from intermittent minimap
                    // updates just pull the average toward the true rate.
                    var n = samples.length / 3;
                    if (n >= 2) {
                        var t0 = samples[0];
                        var sumT = 0, sumX = 0, sumY = 0, sumTT = 0, sumTX = 0, sumTY = 0;
                        for (var si = 0; si < samples.length; si += 3) {
                            var tt = (samples[si] - t0) / 1000.0; // seconds, window-relative
                            var xx = samples[si + 1];
                            var yy = samples[si + 2];
                            sumT += tt; sumX += xx; sumY += yy;
                            sumTT += tt * tt; sumTX += tt * xx; sumTY += tt * yy;
                        }
                        var spanSec = (samples[samples.length - 3] - t0) / 1000.0;
                        var denom = (n * sumTT) - (sumT * sumT);
                        if (spanSec >= (COMPASS_SPEED_MIN_SPAN_MS / 1000.0) && denom > 1e-9) {
                            var vx = ((n * sumTX) - (sumT * sumX)) / denom; // %/sec
                            var vy = ((n * sumTY) - (sumT * sumY)) / denom; // %/sec
                            var speedInstant = Math.sqrt((vx * vx) + (vy * vy)) * 100.0;
                            if (isFinite(speedInstant) && speedInstant >= 0 && speedInstant < 10000) {
                                var dtSmoothSec = (State.compass.lastPosTimeMs > 0)
                                    ? (nowMs - State.compass.lastPosTimeMs) / 1000.0
                                    : (COMPASS_SPEED_SAMPLE_MS / 1000.0);
                                if (!(dtSmoothSec > 0) || dtSmoothSec > 1.0) dtSmoothSec = COMPASS_SPEED_SAMPLE_MS / 1000.0;
                                if (State.compass.speedSmoothed === null || !isFinite(State.compass.speedSmoothed)) {
                                    State.compass.speedSmoothed = speedInstant;
                                } else {
                                    var alpha = 1.0 - Math.exp(-dtSmoothSec / COMPASS_SPEED_EMA_TAU_SEC);
                                    var sdelta = speedInstant - State.compass.speedSmoothed;
                                    // Within the deadband, ease off so a steady
                                    // speed reads as a steady number, not a wobble.
                                    if (Math.abs(sdelta) < State.compass.speedSmoothed * COMPASS_SPEED_DEADBAND_FRAC) {
                                        alpha *= 0.25;
                                    }
                                    if (speedInstant < 0.5) alpha = 1.0; // snap to rest
                                    State.compass.speedSmoothed = State.compass.speedSmoothed + (alpha * sdelta);
                                }
                            }
                        }
                    }
                    State.compass.lastPosX = pos.x;
                    State.compass.lastPosY = pos.y;
                    State.compass.lastPosTimeMs = nowMs;
                }
            }

            if (State.compass.speedSmoothed !== null && isFinite(State.compass.speedSmoothed)) {
                var calibrated = State.compass.speedSmoothed * COMPASS_SPEED_SCALE;
                if (!isFinite(calibrated)) calibrated = 0;
                if (calibrated < 0) calibrated = 0;

                State.compass.speedDisplay = calibrated;
                var quantized = State.compass.speedDisplay;

                if (COMPASS_SPEED_QUANT > 1) {
                    quantized = Math.round(quantized / COMPASS_SPEED_QUANT) * COMPASS_SPEED_QUANT;
                } else {
                    quantized = Math.round(quantized);
                }
                if (quantized < 5) quantized = 0;
                speedValueText = String(quantized);
            }
            State.compass.lastSpeedValueText = speedValueText;
            State.compass.nextSpeedSampleMs = nowMs + COMPASS_SPEED_SAMPLE_MS;
        }
        if (speedLabel) {
            if (speedLabel.text !== speedValueText) speedLabel.text = speedValueText;
        }
    }

    function compassLoop() {
        ProfileHit("compassLoop");
        var nextDelaySec = COMPASS_INTERVAL_IDLE_SEC;
        var perfLoopStartMs = PerfNowMs();
        try {
            var root = GetUIRoot();
            var cfg = State.lastConfig || _BDC();

            // Use precomputed gates from main loop (5Hz) to avoid redundant
            // Number() config checks and sticky-state evaluations at 20Hz.
            var gates = State.lastResolvedGates;

            // Hard-gate: skip when no compass-specific features are active.
            // Don't use State.allFeaturesDisabled — that's global. The compass
            // should idle when its own features are off, regardless of what
            // else is running.
            var compassHasWork = false;
            if (gates) {
                compassHasWork = gates.compassOverlay ||
                    gates.compassMinimapRotate ||
                    gates.compassItemMirror ||
                    gates.compassReloadCd ||
                    gates.compassUltCd ||
                    gates.compassTargetShapesFast;
                if (!compassHasWork) {
                    nextDelaySec = COMPASS_INTERVAL_DEEP_IDLE_SEC;
                    var _cidle = DetectGlobalIdleState(root);
                    if (_cidle.level !== "active") {
                        nextDelaySec = Math.max(nextDelaySec, GetDynamicLoopInterval(nextDelaySec, _cidle));
                    }
                    return;
                }
            }

            cfg = ApplyForcedFeatureDisables(cfg);
            if (State.perfEnabled || IsCfgEnabled(cfg, "ENABLE_PERF_DEBUG")) {
                UpdatePerfEnabledFromConfig(cfg);
            }
            if (State.perfEnabled) {
                State.perfCompassLoopCount += 1;
                State.perfLastCompassStartMs = perfLoopStartMs;
            }
            var hasCompassRuntimeWork = false;
            if (root) {
                var nowMsCompassLoop = Date.now ? Date.now() : (new Date()).getTime();

                if (gates) {
                    // Fast path — read precomputed gates from main loop
                    if (gates.compassOverlay) {
                        hasCompassRuntimeWork = true;
                        ExecuteFeature("compass.overlay", function() {
                            var perfSection = PerfStart();
                            UpdateCompassOverlay(root, nowMsCompassLoop);
                            PerfEnd("compass.overlay", perfSection);
                        });
                    }

                    if (gates.compassMinimapRotate) {
                        hasCompassRuntimeWork = true;
                        ExecuteFeature("compass.minimap_rotate", function() {
                            var perfSection = PerfStart();
                            UpdateMinimapRotateWithPlayer(root, cfg, nowMsCompassLoop);
                            PerfEnd("compass.minimap_rotate", perfSection);
                        });
                    }

                    if (gates.compassItemMirror || State.itemMirror.displayMode === "active" || State.itemMirror.probeWasEnabled) {
                        hasCompassRuntimeWork = true;
                        ExecuteFeature("compass.item_mirror", function() {
                            var perfSection = PerfStart();
                            UpdateItemMirrorProbe(root, cfg);
                            PerfEnd("compass.item_mirror", perfSection);
                        });
                    }

                    if (gates.compassReloadCd) {
                        hasCompassRuntimeWork = true;
                        ExecuteFeature("compass.reload_cd", function() {
                            var perfSection = PerfStart();
                            UpdateReloadCooldownOverlay(root, cfg);
                            PerfEnd("compass.reload_cd", perfSection);
                        });
                    }

                    if (gates.compassUltCd) {
                        hasCompassRuntimeWork = true;
                        ExecuteFeature("compass.ult_cd", function() {
                            var perfSection = PerfStart();
                            UpdateUltimateCooldownOverlay(root, cfg);
                            PerfEnd("compass.ult_cd", perfSection);
                        });
                    }

                    if (gates.compassTargetShapesFast) {
                        hasCompassRuntimeWork = true;
                        var _rdEnabled = gates.redDiamondEnabled || false;
                        ExecuteFeature("compass.target_shapes_fast", function() {
                            var perfSection = PerfStart();
                            var unitTargetStyleFast = ResolveUnitTargetStyleTexts(cfg);
                            ApplyTargetShapeStyles(root, unitTargetStyleFast.scaleText, unitTargetStyleFast.opacityText, nowMsCompassLoop, _rdEnabled, unitTargetStyleFast.hintScaleText);
                            PerfEnd("compass.target_shapes_fast", perfSection);
                        });
                    }
                } else {
                    // Fallback — first tick(s) before main loop has populated gates
                    var redDiamondEnabled = IsCfgEnabled(cfg, "ENABLE_RED_DIAMOND");
                    var unitTargetCustomized = IsUnitTargetStyleCustomized(cfg);
                    var unitTargetFastMode = unitTargetCustomized || redDiamondEnabled;
                    var compassEnabled = IsCfgEnabled(cfg, "ENABLE_COMPASS");
                    var compassSpeedEnabled = IsCfgEnabled(cfg, "ENABLE_COMPASS_SPEED");
                    var rotateEnabled = IsCfgEnabled(cfg, "MINIMAP_ROTATE_WITH_PLAYER");
                    var minimapFlipEnabled = IsCfgEnabled(cfg, "MINIMAP_FLIP");
                    var itemMirrorEnabled = IsPassiveCooldownAdvancedMode(ResolvePassiveCooldownMode(cfg));
                    var itemMirrorRuntimeActive = itemMirrorEnabled;
                    var reloadEnabled = IsCfgEnabled(cfg, "ENABLE_RELOAD_COOLDOWN");
                    var ultCooldownEnabled = IsCfgEnabled(cfg, "ENABLE_ULT_COOLDOWNS");

                    if (compassEnabled || compassSpeedEnabled) {
                        hasCompassRuntimeWork = true;
                        ExecuteFeature("compass.overlay", function() {
                            var perfSection = PerfStart();
                            UpdateCompassOverlay(root, nowMsCompassLoop);
                            PerfEnd("compass.overlay", perfSection);
                        });
                    }

                    if (rotateEnabled || minimapFlipEnabled) {
                        hasCompassRuntimeWork = true;
                        ExecuteFeature("compass.minimap_rotate", function() {
                            var perfSection = PerfStart();
                            UpdateMinimapRotateWithPlayer(root, cfg, nowMsCompassLoop);
                            PerfEnd("compass.minimap_rotate", perfSection);
                        });
                    }

                    if (itemMirrorRuntimeActive || State.itemMirror.displayMode === "active" || State.itemMirror.probeWasEnabled) {
                        hasCompassRuntimeWork = true;
                        ExecuteFeature("compass.item_mirror", function() {
                            var perfSection = PerfStart();
                            UpdateItemMirrorProbe(root, cfg);
                            PerfEnd("compass.item_mirror", perfSection);
                        });
                    }

                    if (reloadEnabled) {
                        hasCompassRuntimeWork = true;
                        ExecuteFeature("compass.reload_cd", function() {
                            var perfSection = PerfStart();
                            UpdateReloadCooldownOverlay(root, cfg);
                            PerfEnd("compass.reload_cd", perfSection);
                        });
                    }

                    if (ultCooldownEnabled) {
                        hasCompassRuntimeWork = true;
                        ExecuteFeature("compass.ult_cd", function() {
                            var perfSection = PerfStart();
                            UpdateUltimateCooldownOverlay(root, cfg);
                            PerfEnd("compass.ult_cd", perfSection);
                        });
                    }

                    if (unitTargetFastMode) {
                        hasCompassRuntimeWork = true;
                        ExecuteFeature("compass.target_shapes_fast", function() {
                            var perfSection = PerfStart();
                            var unitTargetStyleFast = ResolveUnitTargetStyleTexts(cfg);
                            ApplyTargetShapeStyles(root, unitTargetStyleFast.scaleText, unitTargetStyleFast.opacityText, nowMsCompassLoop, redDiamondEnabled, unitTargetStyleFast.hintScaleText);
                            PerfEnd("compass.target_shapes_fast", perfSection);
                        });
                    }
                }
            }
            var nowMsCompass = Date.now ? Date.now() : (new Date()).getTime();
            var useFastInterval;
            var itemMirrorRuntimeActive;
            var itemMirrorFastActive = false;
            if (gates) {
                itemMirrorRuntimeActive = gates.compassItemMirror;
                itemMirrorFastActive = gates.compassItemMirror && (nowMsCompass < (State.itemMirror.fastModeUntilMs || 0));
                useFastInterval = (
                    gates.compassOverlay ||
                    gates.compassMinimapRotate ||
                    itemMirrorFastActive ||
                    gates.compassReloadCd ||
                    gates.compassUltCd ||
                    gates.compassTargetShapesFast
                );
            } else {
                itemMirrorRuntimeActive = IsPassiveCooldownAdvancedMode(ResolvePassiveCooldownMode(cfg)) || State.itemMirror.probeWasEnabled || State.itemMirror.displayMode === "active";
                itemMirrorFastActive = itemMirrorRuntimeActive && (nowMsCompass < (State.itemMirror.fastModeUntilMs || 0));
                useFastInterval = (cfg && (
                    IsCfgEnabled(cfg, "ENABLE_COMPASS") ||
                    IsCfgEnabled(cfg, "ENABLE_COMPASS_SPEED") ||
                    IsCfgEnabled(cfg, "MINIMAP_ROTATE_WITH_PLAYER") ||
                    itemMirrorFastActive ||
                    IsCfgEnabled(cfg, "ENABLE_RELOAD_COOLDOWN") ||
                    IsCfgEnabled(cfg, "ENABLE_ULT_COOLDOWNS") ||
                    (IsCfgEnabled(cfg, "ENABLE_RED_DIAMOND") || IsUnitTargetStyleCustomized(cfg))
                ));
            }
            if (State.perfEnabled) {
                PerfRecord("compass.total", PerfNowMs() - perfLoopStartMs);
                FlushPerfIfNeeded(false);
            }
            if (useFastInterval) {
                nextDelaySec = COMPASS_INTERVAL_SEC;
            } else if (itemMirrorRuntimeActive) {
                nextDelaySec = ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE / 1000.0;
            } else if (hasCompassRuntimeWork) {
                nextDelaySec = COMPASS_INTERVAL_IDLE_SEC;
            } else {
                nextDelaySec = COMPASS_INTERVAL_DEEP_IDLE_SEC;
            }

            // Apply game-state-aware degradation on top of feature-based interval (Fix 9 extended)
            var compassIdleState = DetectGlobalIdleState(root);
            if (compassIdleState.level !== "active") {
                nextDelaySec = Math.max(nextDelaySec, GetDynamicLoopInterval(nextDelaySec, compassIdleState));
            }
        } catch (err) {
            LogLoopException("compassLoop", err, "compassErrorNextLogMs", PerfNowMs());
        } finally {
            $.Schedule(nextDelaySec, compassLoop);
        }
    }

    function IsBuildRequestQueueActive(root) {
        if (!root || !root.GetAttributeString) return false;
        var saveState = String(root.GetAttributeString(BUILD_SAVE_STATE_ATTR, "") || "");
        var clearState = String(root.GetAttributeString(BUILD_CLEAR_STATE_ATTR, "") || "");
        if (saveState === "pending" || clearState === "pending") return true;
        var saveReq = String(root.GetAttributeString(BUILD_SAVE_REQUEST_ATTR, "") || "").trim();
        var clearReq = String(root.GetAttributeString(BUILD_CLEAR_REQUEST_ATTR, "") || "").trim();
        return (saveReq.length > 0 || clearReq.length > 0);
    }

    function IsBuildRequestRuntimeActive() {
        if (State.buildSaveActiveToken && String(State.buildSaveActiveToken).length > 0) return true;
        if (State.buildClearActiveToken && String(State.buildClearActiveToken).length > 0) return true;
        if (State.saveSettingsLoaderSessionActive || State.clearSettingsLoaderSessionActive) return true;
        if (State.buildSaveStage && String(State.buildSaveStage).length > 0) return true;
        if (State.buildClearStage && String(State.buildClearStage).length > 0) return true;
        return false;
    }

    function buildRequestLoop() {
        ProfileHit("buildRequestLoop");
        var nextDelaySec = BUILD_REQUEST_LOOP_IDLE_SEC;
        try {
            var root = GetUIRoot();
            if (!root || !root.GetAttributeString) {
                // No root available — game is likely in a transitional state. Use deep idle.
                nextDelaySec = BUILD_REQUEST_LOOP_DEEP_IDLE_SEC;
                return;
            }

            var queueActive = IsBuildRequestQueueActive(root);
            var runtimeActive = IsBuildRequestRuntimeActive();
            if (!queueActive && !runtimeActive) {
                nextDelaySec = BUILD_REQUEST_LOOP_DEEP_IDLE_SEC;
                // Apply game-state-aware degradation on top (Fix 9 extended)
                var buildIdleState = DetectGlobalIdleState(root);
                if (buildIdleState.level !== "active") {
                    nextDelaySec = Math.max(nextDelaySec, GetDynamicLoopInterval(nextDelaySec, buildIdleState));
                }
                return;
            }

            var raw = ReadStorageConfigRawFromUi(root);
            var cfg = null;
            if (raw === State.lastRawConfig && State.lastConfig) {
                cfg = State.lastConfig;
            } else {
                cfg = _SPC(raw);
                if (!cfg) cfg = _BDC();
            }
            cfg = ApplyForcedFeatureDisables(cfg);
            var nowMsLoop = Date.now ? Date.now() : (new Date()).getTime();
            ExecuteFeature("buildRequest.orchestration", function() {
                ProcessBuildRequestOrchestration(root, nowMsLoop, cfg);
            });
            nextDelaySec = IsBuildRequestQueueActive(root) ? BUILD_REQUEST_LOOP_ACTIVE_SEC : BUILD_REQUEST_LOOP_IDLE_SEC;

            // Apply game-state-aware degradation on top of feature-based interval (Fix 9 extended)
            var buildIdleState = DetectGlobalIdleState(root);
            if (buildIdleState.level !== "active") {
                nextDelaySec = Math.max(nextDelaySec, GetDynamicLoopInterval(nextDelaySec, buildIdleState));
            }
        } catch (err) {
            LogLoopException("buildRequestLoop", err, "buildRequestErrorNextLogMs", PerfNowMs());
        } finally {
            $.Schedule(nextDelaySec, buildRequestLoop);
        }
    }

    function EnsureCachedPanelByIds(root, cacheKey, ids) {
        var cached = IsPanelValid(State.cachedPanels[cacheKey]) ? State.cachedPanels[cacheKey] : null;
        if (cached) return cached;
        if (!root || !root.FindChildTraverse || !ids || ids.length <= 0) {
            State.cachedPanels[cacheKey] = null;
            return null;
        }
        var panel = null;
        for (var i = 0; i < ids.length; i++) {
            panel = root.FindChildTraverse(ids[i]);
            if (panel) break;
        }
        State.cachedPanels[cacheKey] = panel || null;
        return panel || null;
    }

    function EnsureMinimapPanelCache(root) {
        if (State.cachedPanels.minimap && IsPanelListValid(State.cachedPanels.minimap)) {
            return State.cachedPanels.minimap;
        }
        var panels = [];
        if (root && root.FindChildTraverse) {
            var ids = ["minimap_persp", "minimap_container", "minimap_frame", "HudMinimapContainer", PANEL_ID_MINIMAP];
            for (var i = 0; i < ids.length; i++) {
                var panel = root.FindChildTraverse(ids[i]);
                if (panel) panels.push(panel);
            }
        }
        State.cachedPanels.minimap = panels;
        return panels;
    }

    function EnsurePassiveHudPanelCache(root) {
        return EnsureCachedPanelByIds(root, "passiveHud", ["hud_passive_items"]);
    }

    function EnsureGameTimePanelCache(root) {
        return EnsureCachedPanelByIds(root, "gameTime", ["HudGameTime", "GameTime"]);
    }

    function EnsureAbilitiesContainerPanelCache(root) {
        return EnsureCachedPanelByIds(root, "abilitiesContainer", [PANEL_ID_ABILITIES_CONTAINER]);
    }


    function TryGetGameplayMouseCursorPosition() {
        // GameUI.GetCursorPosition confirmed absent — custom gameplay cursor disabled.
        return null;
    }

    function ApplyCoreLoopRootClassesAndState(root, cfg, nowMsLoop, hideoutConnected, hasConfigSource) {
        var redDiamondEnabled = IsCfgEnabled(cfg, "ENABLE_RED_DIAMOND");
        var hideTestingTools = (cfg.ENABLE_HIDE_TESTING_TOOLS === 1);
        var forceShowTestingTools = (cfg.ENABLE_FORCE_TESTING_TOOLS === 1) && !hideTestingTools;
        var healthbarType = _NHV(cfg.HEALTHBAR_TYPE);
        var minimalistHealthbarEnabled = (healthbarType === HEALTHBAR_TYPE_MINIMALIST);
        var fgHealthbarEnabled = (healthbarType === HEALTHBAR_TYPE_FG);
        var klutzHealthbarEnabled = (healthbarType === HEALTHBAR_TYPE_KLUTZ);
        var budhudHealthbarEnabled = (healthbarType === HEALTHBAR_TYPE_BUDHUD);
        var minecraftHealthbarEnabled = (healthbarType === HEALTHBAR_TYPE_MINECRAFT);
        var enemyV2EnhancedEnabled = false;
        var colorWarningEnabled = IsColorWarningEnabled(cfg);
        var cleanStacksEnabled = IsCfgEnabled(cfg, "ENABLE_CLEAN_STACKS");
        // WHY: compass_active class controls the compass dial visibility, gated
        // on ENABLE_COMPASS alone. The host panel, however, is shared with the
        // standalone speed readout, so it must stay alive whenever EITHER the
        // compass or the speed feature is on.
        var compassEnabled = (cfg.ENABLE_COMPASS === 1);
        var compassSpeedEnabled = (cfg.ENABLE_COMPASS_SPEED === 1);
        // When BOTH compass and speed are disabled, collapse the panel via
        // inline style. CSS class removal alone isn't sufficient — the compass
        // loop sets visibility:visible as an inline style which overrides CSS.
        // Collapsing on !compassEnabled alone would fight the compass loop in
        // speed-only mode (5Hz collapse vs 20Hz show) and flicker the speed.
        if (!compassEnabled && !compassSpeedEnabled) {
            var _compassRoot = GetCachedPanel("compassRoot");
            if (IsPanelValid(_compassRoot)) {
                try { _compassRoot.style.visibility = "collapse"; } catch(_ce) { QOL_WARN("core", "op failed: " + (_ce && _ce.message ? _ce.message : String(_ce || ""))); }
            }
            var _speedRoot = GetCachedPanel("speedRoot");
            if (IsPanelValid(_speedRoot)) {
                try { _speedRoot.style.visibility = "collapse"; } catch(_se) { QOL_WARN("core", "op failed: " + (_se && _se.message ? _se.message : String(_se || ""))); }
            }
        }
        var passiveCooldownMode = ResolvePassiveCooldownMode(cfg);
        var staticSig = [
            hideoutConnected ? 1 : 0,
            cfg.ENABLE_AMMO_STATUS,
            cfg.ENABLE_HIDE_MAGAZINE,
            cfg.ENABLE_HIDE_AMMO_ALL,
            cfg.ENABLE_HIDE_RELOAD_ICON,
            cfg.ENABLE_HIDE_RELOAD_CIRCLE,
            redDiamondEnabled ? 1 : 0,
            cfg.ENABLE_IMPROVED_HINT,
            cfg.ENABLE_ZIP_BOOST,
            cfg.ENABLE_UNSECURED_SOUL_TIMER,
            cfg.ENABLE_STAT_BONUSES,
            cfg.ENABLE_CENTER_ESC,
            cfg.ENABLE_CENTER_FRIENDS_LIST,
            cfg.ENABLE_LEGACY_COOLDOWNS,
            cfg.ENABLE_MINIMALISTIC_PAUSE,
            hideTestingTools ? 1 : 0,
            forceShowTestingTools ? 1 : 0,
            cfg.ENABLE_SPECIALS,
            cfg.ENABLE_HERO_SCENE_PANEL,
            cfg.ENABLE_HIDE_FAILED_HINT,
            cfg.ENABLE_HIDE_ABILITY_SUGGESTION,
            cfg.ENABLE_HIDE_COSMETIC_ABILITY,
            cfg.ENABLE_SIMPLIFY_ABILITY_ICONS,
            cfg.ENABLE_HIDE_BEHAVIOR_SUMMARY,
            cfg.ENABLE_BUFF_HUD,
            cfg.ENABLE_REJUV_HUD,
            cfg.ENABLE_MINIMAP_BUFF_TIMER,
            cfg.ENABLE_MINIMAP_REJUV_TIMER,
            cfg.ENABLE_BHOP,
            healthbarType,
            minecraftHealthbarEnabled ? 1 : 0,
            Number(cfg.ENABLE_MINECRAFT_HEALTH_NUMBERS),
            colorWarningEnabled ? 1 : 0,
            cleanStacksEnabled ? 1 : 0,
            compassEnabled ? 1 : 0,
            cfg.ENABLE_SIMPLIFY_COMPASS,
            passiveCooldownMode,
            cfg.ENABLE_ULT_COOLDOWNS,
            cfg.ENABLE_KEYBOARD_OVERLAY,
            cfg.ENABLE_FULL_KEYBOARD_LAYOUT,
            cfg.MINIMAL_MINIMAP,
            cfg.ENABLE_MINIMAP_ELEVATION_MARKERS,
            cfg.DISABLE_DAMAGE_REPORT,
            cfg.DISABLE_QUICK_BUY,
            cfg.ENABLE_ENHANCED_QUICKBUY,
            cfg.ENHANCED_QUICKBUY_COUNT,
            cfg.ENABLE_QUICKBUY_CLICK_TO_NOTIFY,
            cfg.ENABLE_SHOP_ITEM_NOTIFICATIONS,
            cfg.ENABLE_HERO_PURCHASE_POPUPS,
            cfg.ENABLE_SHOP_RECENT_PURCHASES,
            cfg.RECENT_PURCHASES_QUICK_MAX,
            cfg.RECENT_PURCHASES_QUICK_DISPLAY_SEC,
            cfg.RECENT_PURCHASES_QUICK_OPACITY,
            cfg.RECENT_PURCHASES_PANEL_OPACITY,
            cfg.ENABLE_HUD_SHIFT,
            cfg.SUPPORT_16_10,
            cfg.SUPPORT_4_3,
            cfg.ACTIVE_PRESET_NAME,
            cfg.ENABLE_UNSPENT_SOULS,
            cfg.ENABLE_BETTER_UNSECURED,
            cfg.ENABLE_MIN_SOULS,
            cfg.ENABLE_OBJ_DMG,
            cfg.ENABLE_OBJ_MAP,
            cfg.ENABLE_URN_DIFF,
            cfg.ENABLE_URN_TIMER,
            cfg.ENABLE_MISSING_HERO,
            cfg.ENABLE_NICKNAMES,
            cfg.DISABLE_PLAYER_NAME_BLUR,
            cfg.ENABLE_CUMULATIVE_DMG,
            cfg.ENABLE_CLEAN_DAMAGE_INDICATORS,
            cfg.ENABLE_DAMAGE_FOUNTAIN,
            cfg.ENABLE_HIDE_SMALL_NUMBERS,
            cfg.ENABLE_HIDE_TROOPER_DAMAGE,
            cfg.ENABLE_SHOP_STATS,
            cfg.ENABLE_SIMPLIFY_SHOP,
            cfg.ENABLE_SIMPLIFY_ITEMS
        ].join("|");
        var shouldApplyStaticClasses =
            State.coreRootStaticSig !== staticSig ||
            !State.rootClassCache ||
            State.rootClassCache.panel !== root;

        var legacyCooldownsEnabled = IsCfgEnabled(cfg, "ENABLE_LEGACY_COOLDOWNS");
        SyncLegacyCooldownsUiFlag(legacyCooldownsEnabled);
        var enhancedQuickbuyEnabled = IsCfgEnabled(cfg, "ENABLE_ENHANCED_QUICKBUY") && Number(cfg.DISABLE_QUICK_BUY) !== 1;
        var quickbuyClickToNotifyEnabled = IsCfgEnabled(cfg, "ENABLE_QUICKBUY_CLICK_TO_NOTIFY") && Number(cfg.DISABLE_QUICK_BUY) !== 1;
        var shopRecentPurchasesEnabled = IsCfgEnabled(cfg, "ENABLE_SHOP_RECENT_PURCHASES");
        var shopRecentPurchasesRedux = IsCfgEnabled(cfg, "ENABLE_HERO_PURCHASE_POPUPS");

        if (shouldApplyStaticClasses) {
            SetPanelClassCached(root, State.rootClassCache, "hide_ammo_custom", cfg.ENABLE_AMMO_STATUS === 0);
            SetPanelClassCached(root, State.rootClassCache, "hide_magazine_active", cfg.ENABLE_HIDE_MAGAZINE === 1);
            SetPanelClassCached(root, State.rootClassCache, "hide_current_ammo_active", cfg.ENABLE_HIDE_AMMO_ALL === 1);
            SetPanelClassCached(root, State.rootClassCache, "hide_reload_icon_active", cfg.ENABLE_HIDE_RELOAD_ICON === 1);
            SetPanelClassCached(root, State.rootClassCache, "hide_reload_circle_active", cfg.ENABLE_HIDE_RELOAD_CIRCLE === 1);
            var redDiamondChanged = SetPanelClassCached(root, State.rootClassCache, "red_diamond_active", redDiamondEnabled);
            if (redDiamondChanged) {
                State.targetShapeStyleSig = "";
                State.nextTargetShapeRefreshMs = 0;
            }
            SetPanelClassCached(root, State.rootClassCache, "improved_hint_active", IsCfgEnabled(cfg, "ENABLE_IMPROVED_HINT"));
            SetPanelClassCached(root, State.rootClassCache, "zip_boost_active", false);
            SetPanelClassCached(root, State.rootClassCache, "zip_boost_overlay_active", cfg.ENABLE_ZIP_BOOST === 1 && !hideoutConnected);
            SetPanelClassCached(root, State.rootClassCache, "unsecured_souls_overlay_active", IsCfgEnabled(cfg, "ENABLE_UNSECURED_SOUL_TIMER") && !hideoutConnected);
            SetPanelClassCached(root, State.rootClassCache, "stat_bonuses_overlay_active", cfg.ENABLE_STAT_BONUSES === 1 && !hideoutConnected);
            SetPanelClassCached(root, State.rootClassCache, "center_esc_active", cfg.ENABLE_CENTER_ESC === 1);
            SetPanelClassCached(root, State.rootClassCache, "center_friends_list_active", IsCfgEnabled(cfg, "ENABLE_CENTER_FRIENDS_LIST"));
            SetPanelClassCached(root, State.rootClassCache, "legacy_cooldowns_active", legacyCooldownsEnabled);
            SetPanelClassCached(root, State.rootClassCache, "minimal_pause_active", IsCfgEnabled(cfg, "ENABLE_MINIMALISTIC_PAUSE"));
            SetPanelClassCached(root, State.rootClassCache, "force_testing_tools_active", forceShowTestingTools);
            SetPanelClassCached(root, State.rootClassCache, "hide_testing_tools_active", hideTestingTools);
            SetPanelClassCached(root, State.rootClassCache, "specials_active", cfg.ENABLE_SPECIALS === 1);
            SetPanelClassCached(root, State.rootClassCache, "hero_scene_panel_visible", cfg.ENABLE_HERO_SCENE_PANEL === 1);
            // P3: coreRoot test mode — gate overlapping classes so manifests can be tested independently.
            // When QOLLOCK_DEV_CORE_ROOT_TEST_MODE=1, these are skipped (manifests own the classes).
            if (!(cfg.QOLLOCK_DEV_CORE_ROOT_TEST_MODE === 1)) {
                SetPanelClassCached(root, State.rootClassCache, "hide_failed_hint_active", cfg.ENABLE_HIDE_FAILED_HINT === 1);
            }
            SetPanelClassCached(root, State.rootClassCache, "hide_ability_suggestion_active", cfg.ENABLE_HIDE_ABILITY_SUGGESTION === 1);
            if (!(cfg.QOLLOCK_DEV_CORE_ROOT_TEST_MODE === 1)) {
                SetPanelClassCached(root, State.rootClassCache, "hide_cosmetic_ability_active", cfg.ENABLE_HIDE_COSMETIC_ABILITY === 1);
                SetPanelClassCached(root, State.rootClassCache, "simplify_ability_icons_active", cfg.ENABLE_SIMPLIFY_ABILITY_ICONS === 1);
            }
            SetPanelClassCached(root, State.rootClassCache, "hide_behavior_summary_active", cfg.ENABLE_HIDE_BEHAVIOR_SUMMARY === 1);
            SetPanelClassCached(root, State.rootClassCache, "buff_hud_disabled", cfg.ENABLE_BUFF_HUD === 0);
            SetPanelClassCached(root, State.rootClassCache, "rejuv_hud_disabled", cfg.ENABLE_REJUV_HUD === 0);
            SetPanelClassCached(root, State.rootClassCache, "minimap_buff_timer_disabled", Number(cfg.ENABLE_MINIMAP_BUFF_TIMER) !== 1);
            SetPanelClassCached(root, State.rootClassCache, "minimap_rejuv_timer_disabled", Number(cfg.ENABLE_MINIMAP_REJUV_TIMER) !== 1);
            SetPanelClassCached(root, State.rootClassCache, "bhop_gamemode_active", false);
            SetPanelClassCached(root, State.rootClassCache, "minimalist_healthbar_active", minimalistHealthbarEnabled);
            SetPanelClassCached(root, State.rootClassCache, "fg_healthbar_active", fgHealthbarEnabled);
            SetPanelClassCached(root, State.rootClassCache, "klutz_healthbar_active", klutzHealthbarEnabled);
            SetPanelClassCached(root, State.rootClassCache, "budhud_healthbar_active", budhudHealthbarEnabled);
            SetPanelClassCached(root, State.rootClassCache, "minecraft_healthbar_active", minecraftHealthbarEnabled);
            SetPanelClassCached(root, State.rootClassCache, "minecraft_health_numbers_disabled", minecraftHealthbarEnabled && Number(cfg.ENABLE_MINECRAFT_HEALTH_NUMBERS) !== 1);
            SetPanelClassCached(root, State.rootClassCache, "enemy_v2_enhanced_active", enemyV2EnhancedEnabled);
            SetPanelClassCached(root, State.rootClassCache, "enemy_v2_enhanced_off", !enemyV2EnhancedEnabled);
            SetPanelClassCached(root, State.rootClassCache, "colored_healthbar_active", colorWarningEnabled && healthbarType === HEALTHBAR_TYPE_DEFAULT);
            SetPanelClassCached(root, State.rootClassCache, "clean_stacks_active", cleanStacksEnabled && !minecraftHealthbarEnabled);
            SetPanelClassCached(root, State.rootClassCache, "clean_stacks_inactive", false);
            SetPanelClassCached(root, State.rootClassCache, "compass_active", compassEnabled);
            SetPanelClassCached(root, State.rootClassCache, "simplify_compass_active", cfg.ENABLE_SIMPLIFY_COMPASS === 1);
            SetPanelClassCached(root, State.rootClassCache, "ult_cooldowns_active", cfg.ENABLE_ULT_COOLDOWNS === 1);
            SetPanelClassCached(root, State.rootClassCache, "keyboard_overlay_active", cfg.ENABLE_KEYBOARD_OVERLAY === 1);
            SetPanelClassCached(root, State.rootClassCache, "keyboard_overlay_full_active", cfg.ENABLE_FULL_KEYBOARD_LAYOUT === 1);
            SetPanelClassCached(root, State.rootClassCache, "minimalist_minimap_active", cfg.MINIMAL_MINIMAP === 1);
            SetPanelClassCached(root, State.rootClassCache, "qol_minimap_elevation_markers_active", IsCfgEnabled(cfg, "ENABLE_MINIMAP_ELEVATION_MARKERS"));
            if (!(cfg.QOLLOCK_DEV_CORE_ROOT_TEST_MODE === 1)) {
                SetPanelClassCached(root, State.rootClassCache, "disable_damage_report_active", cfg.DISABLE_DAMAGE_REPORT === 1);
            }
            SetPanelClassCached(root, State.rootClassCache, "disable_quick_buy_active", cfg.DISABLE_QUICK_BUY === 1);
            SetPanelClassCached(root, State.rootClassCache, "hud_shift_active", cfg.ENABLE_HUD_SHIFT === 1);
            SetPanelClassCached(root, State.rootClassCache, "support_16_10_active", cfg.SUPPORT_16_10 === 1);
            SetPanelClassCached(root, State.rootClassCache, "support_4_3_active", cfg.SUPPORT_4_3 === 1);
            SetPanelClassCached(root, State.rootClassCache, "unspent_souls_disabled", cfg.ENABLE_UNSPENT_SOULS === 0);
            SetPanelClassCached(root, State.rootClassCache, "better_unsecured_active", cfg.ENABLE_BETTER_UNSECURED === 1);
            SetPanelClassCached(root, State.rootClassCache, "min_souls_disabled", cfg.ENABLE_MIN_SOULS === 0);
            SetPanelClassCached(root, State.rootClassCache, "obj_dmg_disabled", cfg.ENABLE_OBJ_DMG === 0);
            SetPanelClassCached(root, State.rootClassCache, "obj_map_disabled", cfg.ENABLE_OBJ_MAP === 0);
            SetPanelClassCached(root, State.rootClassCache, "urn_diff_disabled", cfg.ENABLE_URN_DIFF === 0);
            SetPanelClassCached(root, State.rootClassCache, "rift_timer_disabled", cfg.ENABLE_URN_TIMER === 0);
            SetPanelClassCached(root, State.rootClassCache, "missing_hero_disabled", cfg.ENABLE_MISSING_HERO === 0);
            SetPanelClassCached(root, State.rootClassCache, "nicknames_active", IsCfgEnabled(cfg, "ENABLE_NICKNAMES"));
            SetPanelClassCached(root, State.rootClassCache, "disable_player_name_blur_active", IsCfgEnabled(cfg, "DISABLE_PLAYER_NAME_BLUR"));
            SetPanelClassCached(root, State.rootClassCache, "cumulative_dmg_disabled", cfg.ENABLE_CUMULATIVE_DMG === 0);
            SetPanelClassCached(root, State.rootClassCache, "clean_damage_indicators_active", IsCfgEnabled(cfg, "ENABLE_CLEAN_DAMAGE_INDICATORS"));
            SetPanelClassCached(root, State.rootClassCache, "damage_fountain_active", cfg.ENABLE_DAMAGE_FOUNTAIN === 1);
            SetPanelClassCached(root, State.rootClassCache, "hide_small_numbers_active", cfg.ENABLE_HIDE_SMALL_NUMBERS === 1);
            SetPanelClassCached(root, State.rootClassCache, "hide_trooper_damage_active", cfg.ENABLE_HIDE_TROOPER_DAMAGE === 1);
            SetPanelClassCached(root, State.rootClassCache, "shop_stats_disabled", cfg.ENABLE_SHOP_STATS === 0);
            // simplify_shop_stats_active is scoped to the heroShop panel in ql_feat_heroshop.js
            // (not set on root) to prevent CSS leakage into Tab/scoreboard detail views.
            SetPanelClassCached(root, State.rootClassCache, "simplify_shop_active", cfg.ENABLE_SIMPLIFY_SHOP === 1);
            SetPanelClassCached(root, State.rootClassCache, "simplify_items_active", cfg.ENABLE_SIMPLIFY_ITEMS === 1);
            SetPanelClassCached(root, State.rootClassCache, "enhanced_quickbuy_active", enhancedQuickbuyEnabled);
            SetPanelClassCached(root, State.rootClassCache, "shop_click_to_notify_active", quickbuyClickToNotifyEnabled);
            SetPanelClassCached(root, State.rootClassCache, "shop_recent_purchases_active", shopRecentPurchasesEnabled);
            SetPanelClassCached(root, State.rootClassCache, "shop_recent_purchases_redux", shopRecentPurchasesRedux);
            SetPanelClassCached(root, State.rootClassCache, "shop_item_notifications_active", IsCfgEnabled(cfg, "ENABLE_SHOP_ITEM_NOTIFICATIONS"));
            State.coreRootStaticSig = staticSig;
        }

        var combatIndicatorActive = false;
        var combatIndicatorSignal = false;
        var combatIndicatorRecoveryActive = false;
        if (IsCfgEnabled(cfg, "ENABLE_COMBAT_INDICATOR")) {
            combatIndicatorSignal = IsCombatSignalActive(root, nowMsLoop) === true;
            if (combatIndicatorSignal) {
                State.combatStatus.lastCombatMs = nowMsLoop;
            } else {
                var recentCombatMs = nowMsLoop - Number(State.combatStatus.lastCombatMs || 0);
                combatIndicatorRecoveryActive = State.combatStatus.lastCombatMs > 0 && recentCombatMs <= COMBAT_STATUS_RECOVERY_MS;
            }
            combatIndicatorActive = combatIndicatorSignal || combatIndicatorRecoveryActive;
        }
        var combatIndicatorEnabled = IsCfgEnabled(cfg, "ENABLE_COMBAT_INDICATOR");
        SetPanelClassCached(root, State.rootClassCache, "combat_indicator_enabled", combatIndicatorEnabled);
        SetPanelClassCached(root, State.rootClassCache, "combat_indicator_active", combatIndicatorActive);
        SyncCombatIndicatorHealthbarClasses(root, combatIndicatorActive, combatIndicatorEnabled);
        LogCombatIndicatorDebugState(root, cfg, nowMsLoop, combatIndicatorSignal, combatIndicatorRecoveryActive, combatIndicatorActive);

        var quickbuyPanel = GetCachedPanel("quickbuy");
        if (!quickbuyPanel) {
            quickbuyPanel = root.FindChildTraverse("CitadelHudQuickbuy");
            SetCachedPanel("quickbuy", quickbuyPanel);
        }
        if (quickbuyPanel) {
            var enhancedQuickbuyCount = enhancedQuickbuyEnabled ? NormalizeEnhancedQuickbuyCount(cfg.ENHANCED_QUICKBUY_COUNT) : 3;

            SetPanelClassCached(
                quickbuyPanel,
                State.quickbuyClassCache,
                "enhanced_quickbuy_active",
                enhancedQuickbuyEnabled
            );
            SetPanelClassCached(
                quickbuyPanel,
                State.quickbuyClassCache,
                "shop_click_to_notify_active",
                quickbuyClickToNotifyEnabled
            );
            try {
                quickbuyPanel.SetAttributeInt("qol_enhanced_quickbuy_count", enhancedQuickbuyCount);
                root.SetAttributeInt("qol_enhanced_quickbuy_count", enhancedQuickbuyCount);
            } catch(_quickbuyCountAttrErr) { QOL_WARN("core", "op failed: " + (_quickbuyCountAttrErr && _quickbuyCountAttrErr.message ? _quickbuyCountAttrErr.message : String(_quickbuyCountAttrErr || ""))); }
        } else {
            State.quickbuyClassCache = null;
        }

        if (IsCfgEnabled(cfg, "ENABLE_HIDE_RELOAD_CIRCLE") || GetCachedPanel("activeReloadProgressBar")) {
            UpdateReloadCircleExceptionState(root, cfg);
        }
        // WHY: Skip healthbar work in hideout/sandbox — inline style.opacity set
        // by SetPanelOpacitySafe beats CSS opacity rules on .connectedToHideout.
        var needsHealthbarRuntime = !hideoutConnected && NeedsHealthbarRuntimeHelperWork(cfg, healthbarType, minimalistHealthbarEnabled);
        // P1: skip old healthbar dispatcher when ql_healthbar manifest is active.
        var _hbManifestActive = false;
        try { if (QOL && QOL.core && QOL.core.FeatureRegistry) { _hbManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_healthbar"); } } catch(e) {}
        if (needsHealthbarRuntime && !_hbManifestActive && typeof QOL.updateHealthbarRuntimeHelpers === "function") {
            QOL.updateHealthbarRuntimeHelpers(root, cfg, nowMsLoop, healthbarType, minimalistHealthbarEnabled, fgHealthbarEnabled);
        }
        var needsHealthContainerWork =
            needsHealthbarRuntime ||
            HEALTHBAR_VIS_DEBUG ||
            colorWarningEnabled ||
            State.coloredHealthbarBridgeValue !== "" ||
            shouldApplyStaticClasses;
        if (needsHealthContainerWork) {
            var healthContainer = GetCachedPanel("healthContainer");
            if (!healthContainer) {
                healthContainer = root.FindChildTraverse(PANEL_ID_HEALTH_CONTAINER);
                SetCachedPanel("healthContainer", healthContainer);
            }
            LogHealthbarVisibilityDebug(root, healthContainer, cfg);
            var fgIconPulseMid = false;
            var fgIconPulseLow = false;
            if (fgHealthbarEnabled && healthContainer && healthContainer.BHasClass) {
                try { fgIconPulseMid = !!healthContainer.BHasClass("localPlayerMidHealth"); } catch (eMid) { fgIconPulseMid = false; }
                try { fgIconPulseLow = !!healthContainer.BHasClass("localPlayerLowHealth"); } catch (eLow) { fgIconPulseLow = false; }
            }
            SetPanelClassCached(root, State.rootClassCache, "qol_fg_icon_health_mid", fgIconPulseMid);
            SetPanelClassCached(root, State.rootClassCache, "qol_fg_icon_health_low", fgIconPulseLow);
            if (healthContainer && healthContainer.SetAttributeString) {
                var coloredHealthbarFlag = colorWarningEnabled ? "1" : "0";
                if (State.coloredHealthbarBridgeValue !== coloredHealthbarFlag) {
                    healthContainer.SetAttributeString("QOL_COLORED_HEALTHBAR", coloredHealthbarFlag);
                    State.coloredHealthbarBridgeValue = coloredHealthbarFlag;
                }
            } else if (State.coloredHealthbarBridgeValue !== "") {
                State.coloredHealthbarBridgeValue = "";
            }
        }
        var abilitiesContainerForClass = GetCachedPanel("abilitiesContainer");
        if (shouldApplyStaticClasses || abilitiesContainerForClass) {
            if (!abilitiesContainerForClass) {
                abilitiesContainerForClass = root.FindChildTraverse(PANEL_ID_ABILITIES_CONTAINER);
                SetCachedPanel("abilitiesContainer", abilitiesContainerForClass);
            }
        }
        if (abilitiesContainerForClass && shouldApplyStaticClasses) {
            SetPanelClassCached(abilitiesContainerForClass, State.abilitiesClassCache, "clean_stacks_active", cleanStacksEnabled && !minecraftHealthbarEnabled);
            SetPanelClassCached(abilitiesContainerForClass, State.abilitiesClassCache, "clean_stacks_inactive", false);
        }
        State.compass.enabled = (cfg.ENABLE_COMPASS === 1);
        State.compass.showSpeed = (cfg.ENABLE_COMPASS_SPEED === 1);
        State.compass.scale = (cfg.COMPASS_SCALE === undefined || cfg.COMPASS_SCALE === null) ? 100 : cfg.COMPASS_SCALE;
        State.compass.stretchX = (cfg.COMPASS_STRETCH_X === undefined || cfg.COMPASS_STRETCH_X === null) ? 100 : cfg.COMPASS_STRETCH_X;
        State.compass.stretchY = (cfg.COMPASS_STRETCH_Y === undefined || cfg.COMPASS_STRETCH_Y === null) ? 100 : cfg.COMPASS_STRETCH_Y;
        State.compass.offsetX = (cfg.COMPASS_X_OFFSET === undefined || cfg.COMPASS_X_OFFSET === null) ? 0 : cfg.COMPASS_X_OFFSET;
        State.compass.offsetY = (cfg.COMPASS_Y_OFFSET === undefined || cfg.COMPASS_Y_OFFSET === null) ? 120 : cfg.COMPASS_Y_OFFSET;
        State.compass.speedOffsetX = (cfg.COMPASS_SPEED_X_OFFSET === undefined || cfg.COMPASS_SPEED_X_OFFSET === null) ? 0 : cfg.COMPASS_SPEED_X_OFFSET;
        State.compass.speedOffsetY = (cfg.COMPASS_SPEED_Y_OFFSET === undefined || cfg.COMPASS_SPEED_Y_OFFSET === null) ? 0 : cfg.COMPASS_SPEED_Y_OFFSET;

        if (
            shouldApplyStaticClasses ||
            State.passiveCooldownModeApplied !== passiveCooldownMode ||
            (passiveCooldownMode !== "default" && !GetCachedPanel("passiveHud")) ||
            State.oldItemCooldownRuntimeWasActive
        ) {
            var passiveHudPanelForClass = GetCachedPanel("passiveHud");
            if (!passiveHudPanelForClass) {
                passiveHudPanelForClass = root.FindChildTraverse ? root.FindChildTraverse("hud_passive_items") : null;
                SetCachedPanel("passiveHud", passiveHudPanelForClass);
            }
            if (!(cfg.QOLLOCK_DEV_CORE_ROOT_TEST_MODE === 1)) {
            ApplyPassiveCooldownModeClasses(root, passiveHudPanelForClass, passiveCooldownMode);
            }
        }
        if (HasNonDefaultChatRuntimeConfig(cfg) || State.chatStyleApplied) {
            UpdateChatRuntime(root, cfg);
        }
        UpdateShowBuildIdRuntime(root, cfg);
        if (NeedsDamageReportOffsetWork(cfg)) {
            UpdateDamageReportOffsets(root, cfg);
        }
        if (NeedsUrnTrackerRuntimeWork(cfg)) {
            UpdateUrnTrackerOverlay(root, cfg, nowMsLoop);
        }
        return redDiamondEnabled;
    }


    function NextCoreSchedulerPhase() {
        if (!CORE_SCHEDULER_V2_ENABLED) return 0;
        var serial = Number(State.coreLoopTickSerial);
        if (!isFinite(serial) || serial < 0) serial = 0;
        var phaseCount = Number(CORE_SCHEDULER_PHASE_COUNT);
        if (!isFinite(phaseCount) || phaseCount < 1) phaseCount = 1;
        var phase = serial % phaseCount;
        State.coreLoopTickSerial = serial + 1;
        State.coreLoopPhaseLast = phase;
        return phase;
    }

    function ShouldRunStaggeredDisableCleanup(phase, slot) {
        if (!CORE_SCHEDULER_V2_ENABLED || !CORE_SCHEDULER_STAGGER_CLEANUP) return true;
        var p = Number(phase);
        var s = Number(slot);
        if (!isFinite(p)) p = 0;
        if (!isFinite(s)) s = 0;
        return (p % 3) === (s % 3);
    }

    /**
     * Schedule a bucket of features to run at a staggered offset within the tick.
     * Each feature is a function f(_s) that receives the snapshot object.
     * Per-feature errors are isolated — one crash won't kill the bucket.
     */
    function _scheduleFeatureBucket(offsetSec, features, _s) {
        if (!features || features.length === 0) return;
        // Clone snapshot so deferred callbacks don't see the next tick's
        // overwritten data if the $.Schedule fires late due to jitter.
        var snapshot = Object.assign({}, _s);
        $.Schedule(offsetSec, function() {
            for (var i = 0; i < features.length; i++) {
                var fn = features[i];
                if (!fn) continue;
                try {
                    fn(snapshot);
                } catch (e) {
                    if (typeof $ !== "undefined" && $.Msg) {
                        $.Msg("[QOLLock] bucket feature error: " + (e && e.message ? e.message : String(e)));
                    }
                }
            }
        });
    }
    function NeedsDamageImpactRuntimeWork(cfg) {
        return HasNonDefaultDamageImpactRuntimeConfig(cfg) ||
            !!(State.damageImpactRuntimeStyleSig && String(State.damageImpactRuntimeStyleSig).length > 0) ||
            GetCachedPanel("damageImpactPanel");
    }

    function NeedsHeroShopRuntimeWork(cfg) {
        if (!cfg) return false;
        var shopOffsetX = Number(cfg.SHOP_OFFSET_X);
        var shopOffsetY = Number(cfg.SHOP_OFFSET_Y);
        if (!isFinite(shopOffsetX)) shopOffsetX = 0;
        if (!isFinite(shopOffsetY)) shopOffsetY = 0;
        var shopOpacity = NormalizeOpacityNumber(cfg.SHOP_OPACITY, 1.0);
        var shopScale = NormalizeHudScaleNumber(cfg.SHOP_SCALE, 1.0);
        return (
            Number(cfg.HUD_SHOP_ENABLED) !== 1 ||
            (IsCfgEnabled(cfg, "ENABLE_SHOP_STATS") && IsCfgEnabled(cfg, "ENABLE_SIMPLIFY_SHOP_STATS")) ||
            IsCfgEnabled(cfg, "ENABLE_SIMPLIFY_SHOP") ||
            IsCfgEnabled(cfg, "ENABLE_SIMPLIFY_ITEMS") ||
            IsCfgEnabled(cfg, "DISABLE_SHOP_BLUE") ||
            Math.round(shopOffsetX) !== 0 ||
            Math.round(shopOffsetY) !== 0 ||
            shopOpacity !== 1.0 ||
            shopScale !== 1.0 ||
            !!(State.heroShopMainPanelStyleSig && String(State.heroShopMainPanelStyleSig).length > 0) ||
            GetCachedPanel("heroShop")
        );
    }

    function NeedsTopBarRuntimeWork(cfg) {
        return HasNonDefaultTopBarRuntimeConfig(cfg) ||
            !!(State.topBarRuntimeStyleSig && String(State.topBarRuntimeStyleSig).length > 0) ||
            GetCachedPanel("topBarPanel");
    }

    function NeedsBottomBarRuntimeWork(cfg) {
        return HasNonDefaultBottomBarRuntimeConfig(cfg) ||
            !!(State.bottomBarRuntimeStyleSig && String(State.bottomBarRuntimeStyleSig).length > 0) ||
            GetCachedPanel("bottomBarPanel");
    }

    function NeedsStaminaChargeColorRuntimeWork(cfg) {
        return HasNonDefaultStaminaChargeRuntimeConfig(cfg) ||
            !!(State.staminaChargeAngleStyleSig && String(State.staminaChargeAngleStyleSig).length > 0) ||
            !!(State.staminaChargeColorStyleSig && String(State.staminaChargeColorStyleSig).length > 0) ||
            GetCachedPanel("staminaChargesContainer") ||
            !!(State.staminaChargeColorPanelCache && State.staminaChargeColorPanelCache.length > 0);
    }

    function NeedsItemsRuntimeWork(cfg) {
        return HasNonDefaultItemsRuntimeConfig(cfg) ||
            !!(State.itemsRuntimeStyleSig && String(State.itemsRuntimeStyleSig).length > 0) ||
            GetCachedPanel("itemsModsContainer");
    }

    function NeedsSoulsRuntimeWork(cfg) {
        return HasNonDefaultSoulsRuntimeConfig(cfg) ||
            !!(State.soulsRuntimeStyleSig && String(State.soulsRuntimeStyleSig).length > 0) ||
            GetCachedPanel("soulsContainer");
    }
    function NeedsEnemyColorWarningRuntimeWork(cfg) {
        return IsEnemyColorWarningEnabled(cfg) ||
            State.enemyColoredHealthEnabledPrev === true ||
            !!(State.enemyColoredHealthPanelCache && State.enemyColoredHealthPanelCache.length > 0);
    }

    function NeedsAllyColorWarningRuntimeWork(cfg) {
        return IsAllyColorWarningEnabled(cfg) ||
            State.allyColoredHealthEnabledPrev === true ||
            !!(State.allyColoredHealthPanelCache && State.allyColoredHealthPanelCache.length > 0);
    }

    // IsOnDeathArcadeConfigActive removed (Phase 8) — replaced by feature's gate() via registry loop

    function NeedsGameplayMouseCursorRuntimeWork(root, hideoutConnected) {
        if (!GAMEPLAY_MOUSE_CURSOR_ENABLED || !root) return false;
        if (State.customMouseCursorClassActive || IsPanelValid(State.customMouseCursorPanel)) return true;
        if (hideoutConnected) return false;
        var uiContextActive =
            IsHudClassActive(root, "gShopOpen") ||
            IsHudClassActive(root, "gScoreboardOpen") ||
            IsHudClassActive(root, "gAbilityUpgradeMenu") ||
            IsHudClassActive(root, "gDetailView") ||
            (root.BHasClass && root.BHasClass("ShowEscapeMenu"));
        if (!uiContextActive) return false;
        return IsStartupLoaderInActiveMatchContext(root);
    }
    function IsDl4dReminderRuntimeActive(cfg) {
        return !!(cfg && IsCfgEnabled(cfg, "ENABLE_DL4D_REMINDERS"));
    }

    function IsAnyAnnouncerReminderTypeEnabled(cfg) {
        if (!cfg) return false;
        return (
            IsCfgEnabled(cfg, "ENABLE_MINIMAP_REMINDER") ||
            IsCfgEnabled(cfg, "ENABLE_INTERVAL") ||
            IsCfgEnabled(cfg, "ENABLE_ONE_TIME") ||
            IsColorWarningEnabled(cfg) ||
            IsCfgEnabled(cfg, "ENABLE_ONE_TIME_TIER3")
        );
    }

    function BuildRuntimeFeatureConfigState(cfg, hideoutConnected) {
        var healthbarType = _NHV(cfg && cfg.HEALTHBAR_TYPE);
        var minimalistHealthbarEnabled = (healthbarType === HEALTHBAR_TYPE_MINIMALIST);
        var fgHealthbarEnabled = (healthbarType === HEALTHBAR_TYPE_FG);
        var passiveCooldownMode = ResolvePassiveCooldownMode(cfg);
        var colorWarningEnabled = IsColorWarningEnabled(cfg);
        var damageReportOffsetX = Number(cfg && cfg.DAMAGE_REPORT_X_OFFSET);
        var damageReportOffsetY = Number(cfg && cfg.DAMAGE_REPORT_Y_OFFSET);
        if (!isFinite(damageReportOffsetX)) damageReportOffsetX = 0;
        if (!isFinite(damageReportOffsetY)) damageReportOffsetY = 0;

        var shopOffsetX = Number(cfg && cfg.SHOP_OFFSET_X);
        var shopOffsetY = Number(cfg && cfg.SHOP_OFFSET_Y);
        if (!isFinite(shopOffsetX)) shopOffsetX = 0;
        if (!isFinite(shopOffsetY)) shopOffsetY = 0;
        var topBarOpacity = NormalizeOpacityNumber(cfg && cfg.TOP_BAR_OPACITY, 1.0);
        var bottomBarOpacity = NormalizeOpacityNumber(cfg && cfg.BOTTOM_BAR_OPACITY, 1.0);
        var itemsOpacity = NormalizeOpacityNumber(cfg && cfg.ITEMS_OPACITY, 1.0);
        var soulsOpacity = NormalizeOpacityNumber(cfg && cfg.SOULS_OPACITY, 1.0);
        var shopOpacity = NormalizeOpacityNumber(cfg && cfg.SHOP_OPACITY, 1.0);
        var topBarScale = NormalizeHudScaleNumber(cfg && cfg.TOP_BAR_SCALE, 1.0);
        var bottomBarScale = NormalizeHudScaleNumber(cfg && cfg.BOTTOM_BAR_SCALE, 1.0);
        var shopScale = NormalizeHudScaleNumber(cfg && cfg.SHOP_SCALE, 1.0);

        return {
            redDiamondEnabled: IsCfgEnabled(cfg, "ENABLE_RED_DIAMOND"),
            keyboardRuntimeActive: IsCfgEnabled(cfg, "ENABLE_KEYBOARD_OVERLAY"),
            legacyAudioPassiveActive: (
                IsPassiveCooldownBasicMode(passiveCooldownMode) ||
                ((IsAnyAnnouncerReminderTypeEnabled(cfg) || IsDl4dReminderRuntimeActive(cfg)) && !hideoutConnected)
            ),
            betterUnsecuredHudActive: IsCfgEnabled(cfg, "ENABLE_BETTER_UNSECURED"),
            combatIndicatorActive: IsCfgEnabled(cfg, "ENABLE_COMBAT_INDICATOR"),
            colorWarningActive: colorWarningEnabled,
            enemyColorWarningActive: IsEnemyColorWarningEnabled(cfg),
            allyColorWarningActive: IsAllyColorWarningEnabled(cfg),
            ammoActive: (
                IsCfgEnabled(cfg, "ENABLE_AMMO_STATUS") ||
                IsCfgEnabled(cfg, "ENABLE_HIDE_MAGAZINE") ||
                IsCfgEnabled(cfg, "ENABLE_HIDE_AMMO_ALL") ||
                Number(cfg && cfg.AMMO_PANEL_SCALE) !== 100 ||
                Number(cfg && cfg.AMMO_CURRENT_SCALE) !== 100 ||
                Number(cfg && cfg.AMMO_TOTAL_SCALE) !== 100 ||
                Number(cfg && cfg.AMMO_PANEL_X_OFFSET) !== 0 ||
                Number(cfg && cfg.AMMO_PANEL_Y_OFFSET) !== 0 ||
                ReadAmmoTextColorIndex(cfg) !== 0
            ),
            heroShopActive: (
                Number(cfg && cfg.HUD_SHOP_ENABLED) !== 1 ||
                (IsCfgEnabled(cfg, "ENABLE_SHOP_STATS") && IsCfgEnabled(cfg, "ENABLE_SIMPLIFY_SHOP_STATS")) ||
                IsCfgEnabled(cfg, "ENABLE_SIMPLIFY_SHOP") ||
                IsCfgEnabled(cfg, "ENABLE_SIMPLIFY_ITEMS") ||
                IsCfgEnabled(cfg, "DISABLE_SHOP_BLUE") ||
                IsCfgEnabled(cfg, "ENABLE_SHOP_RECENT_PURCHASES") ||
                Math.round(shopOffsetX) !== 0 ||
                Math.round(shopOffsetY) !== 0 ||
                shopOpacity !== 1.0 ||
                shopScale !== 1.0
            ),
            topBarRuntimeActive: (
                Number(cfg && cfg.HUD_TOP_BAR_ENABLED) !== 1 ||
                topBarOpacity !== 1.0 ||
                topBarScale !== 1.0 ||
                NormalizeHudOffsetNumber(cfg && cfg.TOP_BAR_X_OFFSET, 0) !== 0 ||
                NormalizeHudOffsetNumber(cfg && cfg.TOP_BAR_Y_OFFSET, 0) !== 0
            ),
            bottomBarRuntimeActive: (
                Number(cfg && cfg.HUD_BOTTOM_BAR_ENABLED) !== 1 ||
                bottomBarOpacity !== 1.0 ||
                bottomBarScale !== 1.0 ||
                NormalizeHudOffsetNumber(cfg && cfg.BOTTOM_BAR_X_OFFSET, 0) !== 0 ||
                NormalizeHudOffsetNumber(cfg && cfg.BOTTOM_BAR_Y_OFFSET, 0) !== 0 ||
                ReadBottomBarWashColorIndex(cfg) !== 0
            ),
            itemsRuntimeActive: (
                Number(cfg && cfg.HUD_ITEMS_ENABLED) !== 1 ||
                itemsOpacity !== 1.0 ||
                NormalizeHudOffsetNumber(cfg && cfg.ITEMS_X_OFFSET, 0) !== 0 ||
                NormalizeHudOffsetNumber(cfg && cfg.ITEMS_Y_OFFSET, 0) !== 0 ||
                NormalizePaletteColorIndex(cfg && cfg.ITEMS_WASH_COLOR) !== 0
            ),
            soulsRuntimeActive: (
                Number(cfg && cfg.HUD_SOULS_ENABLED) !== 1 ||
                soulsOpacity !== 1.0 ||
                NormalizeHudOffsetNumber(cfg && cfg.SOULS_X_OFFSET, 0) !== 0 ||
                NormalizeHudOffsetNumber(cfg && cfg.SOULS_Y_OFFSET, 0) !== 0
            ),
            targetShapesActive: (
                IsCfgEnabled(cfg, "ENABLE_RED_DIAMOND") ||
                IsUnitTargetStyleCustomized(cfg)
            ),
            damageImpactRuntimeActive: HasNonDefaultDamageImpactRuntimeConfig(cfg),
            staminaChargeColorRuntimeActive: NeedsStaminaChargeColorRuntimeWork(cfg),
            damageNumbersActive: ResolveDamageNumbersRuntimeSig(cfg) !== DAMAGE_NUMBERS_DEFAULT_RUNTIME_SIG,
            minimapRuntimeActive: (
                IsCfgEnabled(cfg, "ENABLE_ALT_ZOOM") ||
                IsCfgEnabled(cfg, "ENABLE_TAB_ZOOM")
            ),
            healthbarType: healthbarType,
            minimalistHealthbarEnabled: minimalistHealthbarEnabled,
            fgHealthbarEnabled: fgHealthbarEnabled,
            passiveCooldownMode: passiveCooldownMode,
            reloadCircleActive: IsCfgEnabled(cfg, "ENABLE_HIDE_RELOAD_CIRCLE"),
            healthbarRuntimeActive: (
                minimalistHealthbarEnabled ||
                HasNonDefaultPlayerHealthbarRuntimeConfig(cfg) ||
                !!(State.playerHealthbarAccentColorSig && String(State.playerHealthbarAccentColorSig).length > 0) ||
                Number(healthbarType) === 4 ||
                Number(healthbarType) === HEALTHBAR_TYPE_MINECRAFT
            ),
            chatRuntimeActive: HasNonDefaultChatRuntimeConfig(cfg),
            damageReportOffsetActive: (
                Math.round(damageReportOffsetX) !== 0 ||
                Math.round(damageReportOffsetY) !== 0
            ),
            urnTrackerActive: IsCfgEnabled(cfg, "ENABLE_URN_DIFF"),
            colorBridgeTarget: colorWarningEnabled ? "1" : "0",
            recentPurchasesActive: IsCfgEnabled(cfg, "ENABLE_SHOP_RECENT_PURCHASES") || IsCfgEnabled(cfg, "ENABLE_SHOP_ITEM_NOTIFICATIONS")
        };
    }

    function ShouldReuseRuntimeGateSignature(cfg, raw, hideoutConnected, hasConfigSource) {
        return !!(
            State.runtimeGateSig &&
            State.runtimeGateConfigRef === cfg &&
            State.runtimeGateRaw === raw &&
            State.runtimeGateHideoutConnected === (hideoutConnected ? 1 : 0) &&
            State.runtimeGateHasConfigSource === (hasConfigSource ? 1 : 0)
        );
    }

    function RememberRuntimeGateSignatureInputs(cfg, raw, hideoutConnected, hasConfigSource) {
        State.runtimeGateConfigRef = cfg || null;
        State.runtimeGateRaw = raw;
        State.runtimeGateHideoutConnected = hideoutConnected ? 1 : 0;
        State.runtimeGateHasConfigSource = hasConfigSource ? 1 : 0;
    }

    function NeedsCoreRootDynamicRuntimeWorkFromState(featureState) {
        if (!featureState) return false;
        if (featureState.reloadCircleActive || GetCachedPanel("activeReloadProgressBar")) return true;
        if (
            featureState.healthbarRuntimeActive ||
            State.minimalistHealthbarOffsetApplied ||
            !!(State.playerHealthbarAccentColorSig && String(State.playerHealthbarAccentColorSig).length > 0) ||
            State.playerHealthbarScaleOpacityRuntimeApplied ||
            State.budhudWasEnabled ||
            State.mcWasEnabled
        ) return true;
        if (
            featureState.fgHealthbarEnabled ||
            State.fgHeroImageMoved ||
            State.fgHeroImageRuntimeStyleSig !== "" ||
            State.fgHeroImageCurrentSig !== ""
        ) return true;
        if (State.passiveCooldownModeApplied !== featureState.passiveCooldownMode || State.oldItemCooldownRuntimeWasActive) return true;
        if (featureState.passiveCooldownMode !== "default" && !GetCachedPanel("passiveHud")) return true;
        if (HEALTHBAR_VIS_DEBUG) return true;
        if (featureState.colorBridgeTarget === "1" && State.coloredHealthbarBridgeValue !== "1") return true;
        if (featureState.colorBridgeTarget === "0" && State.coloredHealthbarBridgeValue !== "" && State.coloredHealthbarBridgeValue !== "0") return true;
        if (featureState.chatRuntimeActive || State.chatStyleApplied) return true;
        if (
            featureState.damageReportOffsetActive ||
            State.damageReportOffsetApplied ||
            State.damageReportOffsetSig ||
            IsPanelValid(State.damageReportOffsetPanel)
        ) return true;
        if (
            featureState.urnTrackerActive ||
            State.urnTrackerDisplayMode === "active" ||
            (GetCachedPanel("urnTrackerPanel") && State.urnTrackerDisplayMode !== "disabled")
        ) return true;
        if (featureState.staminaChargeColorRuntimeActive) return true;
        return false;
    }

    function BuildRuntimeGateSignature(cfg, raw, hideoutConnected, hasConfigSource) {
        if (!cfg) return "";
        return [
            raw || "",
            hideoutConnected ? 1 : 0,
            hasConfigSource ? 1 : 0,
            cfg.ENABLE_REJUV_HUD,
            cfg.ENABLE_BUFF_HUD,
            cfg.ENABLE_MINIMAP_REJUV_TIMER,
            cfg.ENABLE_MINIMAP_BUFF_TIMER,
            cfg.ENABLE_MIN_SOULS,
            cfg.ACTIVE_PRESET_NAME,
            cfg.ENABLE_UNSPENT_SOULS,
            cfg.ENABLE_NICKNAMES,
            cfg.ENABLE_STATLOCKER,
            cfg.ENABLE_LANE_WITH_PARTY,
            cfg.ENABLE_ON_DEATH_GAMES,
            cfg.ON_DEATH_GAME_MINESWEEPER,
            cfg.ON_DEATH_GAME_BLACKJACK,
            cfg.ON_DEATH_GAME_FLAPPY_BAT,
            cfg.ON_DEATH_GAME_GRAVES_TRAINER,
            cfg.ON_DEATH_GAME_ZERGGY_MANIA,
            cfg.ON_DEATH_GAME_WHACK_A_REM,
            cfg.ENABLE_KEYBOARD_OVERLAY,
            cfg.KEYBOARD_OVERLAY_WASH_COLOR,
            cfg.ENABLE_ZIP_BOOST,
            cfg.ENABLE_UNSECURED_SOUL_TIMER,
            cfg.ENABLE_STAT_BONUSES,
            cfg.ENABLE_COMBAT_STATUS,
            cfg.ENABLE_PASSIVE_COOLDOWN,
            cfg.ENABLE_OLD_ITEM_COOLDOWNS,
            cfg.ENABLE_IMAGES_IN_CHAT,
            cfg.HEALTHBAR_TYPE,
            cfg.PLAYER_HEALTHBAR_ACCENT_COLOR,
            cfg.STAMINA_CHARGE_ANGLE,
            cfg.STAMINA_CHARGE_COLOR,
            cfg.AMMO_TEXT_COLOR,
            cfg.AMMO_CLIP_ANGLE,
            cfg.ENABLE_RED_DIAMOND,
            cfg.ENABLE_COMPASS,
            cfg.ENABLE_COMPASS_SPEED,
            cfg.MINIMAP_ROTATE_WITH_PLAYER,
            cfg.MINIMAP_FLIP,
            cfg.ENABLE_RELOAD_COOLDOWN,
            cfg.ENABLE_DAMAGE_IMPACT,
            cfg.DAMAGE_IMPACT_SCALE,
            cfg.DAMAGE_IMPACT_OPACITY,
            cfg.DAMAGE_IMPACT_X_OFFSET,
            cfg.DAMAGE_IMPACT_Y_OFFSET,
            cfg.ENABLE_ULT_COOLDOWNS,
            cfg.HUD_TOP_BAR_ENABLED,
            cfg.TOP_BAR_OPACITY,
            cfg.TOP_BAR_SCALE,
            cfg.TOP_BAR_X_OFFSET,
            cfg.TOP_BAR_Y_OFFSET,
            cfg.HUD_BOTTOM_BAR_ENABLED,
            cfg.BOTTOM_BAR_OPACITY,
            cfg.BOTTOM_BAR_SCALE,
            cfg.BOTTOM_BAR_X_OFFSET,
            cfg.BOTTOM_BAR_Y_OFFSET,
            cfg.BOTTOM_BAR_WASH_COLOR,
            cfg.HUD_ITEMS_ENABLED,
            cfg.ITEMS_OPACITY,
            cfg.ITEMS_X_OFFSET,
            cfg.ITEMS_Y_OFFSET,
            cfg.ITEMS_WASH_COLOR,
            cfg.HUD_SOULS_ENABLED,
            cfg.SOULS_OPACITY,
            cfg.SOULS_X_OFFSET,
            cfg.SOULS_Y_OFFSET,
            cfg.HUD_SHOP_ENABLED,
            cfg.SHOP_OFFSET_X,
            cfg.SHOP_OFFSET_Y,
            cfg.SHOP_OPACITY,
            cfg.SHOP_SCALE,
            cfg.ENABLE_DL4D_REMINDERS,
            cfg.DL4D_VOLUME,
            cfg.ENABLE_DL4D_CAPTIONS,
            cfg.ENABLE_DL4D_SMALL_CAMPS_BOXES,
            cfg.ENABLE_DL4D_RUNE_MELEE_TROOPERS,
            cfg.ENABLE_DL4D_MEDIUM_CAMPS,
            cfg.ENABLE_DL4D_BIG_CAMPS_SINNERS,
            cfg.ENABLE_DL4D_MIDBOSS_URN_GOLD_RUNE,
            cfg.ENABLE_DL4D_LANE_GUARDIAN_WEAK,
            cfg.ENABLE_DL4D_RUNE,
            cfg.ENABLE_DL4D_WALKER_WEAK,
            cfg.ENABLE_DL4D_RUNE_FAST_TROOPERS,
            cfg.ENABLE_DL4D_RUNE_GOLD_BUFFS,
            cfg.ENABLE_DL4D_RUNE_TROOPERS20_HP
        ].join("|");
    }

    function ResolveRuntimeGates(root, cfg, raw, hideoutConnected, hasConfigSource, corePhase) {
        var reuseGateSig = ShouldReuseRuntimeGateSignature(cfg, raw, hideoutConnected, hasConfigSource);
        var sig = reuseGateSig ? State.runtimeGateSig : BuildRuntimeGateSignature(cfg, raw, hideoutConnected, hasConfigSource);
        if (!reuseGateSig) {
            RememberRuntimeGateSignatureInputs(cfg, raw, hideoutConnected, hasConfigSource);
        }
        var gates = State.runtimeGates;
        if (!gates || State.runtimeGateSig !== sig) {
            var featureState = BuildRuntimeFeatureConfigState(cfg, hideoutConnected);
            gates = {
                sig: sig,
                featureState: featureState,
                redDiamondEnabled: featureState.redDiamondEnabled
            };
            // ── Phase 8: registry-driven base gate computation ──
            // Call each feature's registered gate() for the base config check,
            // then apply cross-cutting sticky-state and phase-gating overrides below.
            var _fn = _getRegistryKeys();
            for (var _gi = 0; _gi < _fn.length; _gi++) {
                var _fname = _fn[_gi];
                var _fentry = QOL_FEATURE_REGISTRY[_fname];
                if (!_fentry || !_fentry.gate) continue;
                var _gk = _fentry.gateKey || _fname;
                try {
                    gates[_gk + "Active"] = _fentry.gate(cfg, raw, hideoutConnected);
                } catch(_ge) {
                    $.Msg("[QOLLock][WARN][core] gate evaluation failed for '" + _fname +
                          "': " + (_ge && _ge.message ? _ge.message : String(_ge)));
                    gates[_gk + "Active"] = false;
                }
                // Phase 10 safety: default non-suffixed gate for populateFeatureBuckets.
                // Post-processing below may override this for features that need
                // staggered-disable cleanup or phase gating.
                gates[_gk] = gates[_gk + "Active"];
            }
            // FeatureState passthroughs — pre-computed once for shared values
            gates.combatIndicatorActive = featureState.combatIndicatorActive;
            gates.recentPurchasesActive = featureState.recentPurchasesActive;
            gates.keyboardRuntimeActive = featureState.keyboardRuntimeActive;
            gates.legacyAudioPassiveActive = featureState.legacyAudioPassiveActive;
            gates.betterUnsecuredHudActive = featureState.betterUnsecuredHudActive;
            gates.colorWarningActive = featureState.colorWarningActive;
            gates.enemyColorWarningActive = featureState.enemyColorWarningActive;
            gates.allyColorWarningActive = featureState.allyColorWarningActive;
            gates.ammoActive = featureState.ammoActive;
            gates.heroShopActive = featureState.heroShopActive;
            gates.topBarRuntimeActive = featureState.topBarRuntimeActive;
            gates.bottomBarRuntimeActive = featureState.bottomBarRuntimeActive;
            gates.itemsRuntimeActive = featureState.itemsRuntimeActive;
            gates.soulsRuntimeActive = featureState.soulsRuntimeActive;
            gates.targetShapesActive = featureState.targetShapesActive;
            gates.damageImpactRuntimeActive = featureState.damageImpactRuntimeActive;
            gates.staminaChargeColorRuntimeActive = featureState.staminaChargeColorRuntimeActive;
            gates.damageNumbersActive = featureState.damageNumbersActive;
            gates.minimapRuntimeActive = featureState.minimapRuntimeActive;
            State.runtimeGateSig = sig;
            State.runtimeGates = gates;
        }

        gates.rejuvTimers = gates.rejuvTimersActive || (!gates.rejuvTimersActive && !State.rejuvWasDisabled && ShouldRunStaggeredDisableCleanup(corePhase, CORE_PHASE_REJUV_NICKNAMES));
        gates.spm = (gates.spmActive || (!gates.spmActive && !State.spm.wasDisabled && ShouldRunStaggeredDisableCleanup(corePhase, CORE_PHASE_SPM_STATLOCKER))) && ((!CORE_SCHEDULER_V2_ENABLED) || (corePhase === CORE_PHASE_SPM_STATLOCKER));
        // WHY: unspent processes 1 player per tick — light enough to run every tick
        // instead of being gated by the 5-phase scheduler (which would limit it to 1Hz).
        gates.unspent = gates.unspentActive || (!gates.unspentActive && !State.unspentWasDisabled && ShouldRunStaggeredDisableCleanup(corePhase, CORE_PHASE_UNSPENT_LANE));
        gates.nicknames = (gates.nicknamesActive || !!State.topbarNicknamesWasEnabled) && ((!CORE_SCHEDULER_V2_ENABLED) || (corePhase === CORE_PHASE_REJUV_NICKNAMES));
        gates.statlocker = (gates.statlockerActive || State.statlockerWasEnabled) && ((!CORE_SCHEDULER_V2_ENABLED) || (corePhase === CORE_PHASE_SPM_STATLOCKER));
        gates.onDeathArcade = gates.onDeathArcadeActive || State.onDeathArcadeRuntimeWasActive || State.onDeathArcadeWasDead;
        gates.laneWithParty = gates.laneWithPartyActive && ((!CORE_SCHEDULER_V2_ENABLED) || (corePhase === CORE_PHASE_UNSPENT_LANE));
        gates.keyboardRuntime = gates.keyboardRuntimeActive || GetCachedPanel("keyboardOverlayRoot") || !!(State.allBindingsBoxes && State.allBindingsBoxes.length > 0);
        gates.zipBoost = gates.zipBoostActive || State.zipBoostDisplayMode !== "";
        gates.unsecuredSouls = (gates.unsecuredSoulsActive || State.unsecuredSouls.displayMode !== "") && ((!CORE_SCHEDULER_V2_ENABLED) || (corePhase === CORE_PHASE_UNSECURED));
        gates.statBonuses = (gates.statBonusesActive || State.statBonuses.displayMode !== "") && ((!CORE_SCHEDULER_V2_ENABLED) || (corePhase === CORE_PHASE_STAT_BONUSES));
        gates.combatStatus = gates.combatStatusActive || gates.combatIndicatorActive || State.combatStatus.displayMode !== "";
        gates.signatureFlash = gates.signatureFlashActive || !!State.signatureCooldownFlashWasEnabled;
        gates.legacyAudioPassive = gates.legacyAudioPassiveActive;
        gates.imagesInChat = gates.imagesInChatActive;
        gates.showRank = gates.showRankActive;
        gates.recentPurchases = gates.recentPurchasesActive || State.recentPurchasesWasEnabled;
        gates.gameplayMouseCursor = NeedsGameplayMouseCursorRuntimeWork(root, hideoutConnected);
        gates.betterUnsecuredHud = gates.betterUnsecuredHudActive || !!(
            State.unsecuredSouls.hudStyleSig ||
            GetCachedPanel("betterUnsecuredOverlay") ||
            GetCachedPanel("unsecuredSoulsHudContainer")
        );
        gates.colorWarning = gates.colorWarningActive;
        gates.enemyColorWarning = NeedsEnemyColorWarningRuntimeWork(cfg);
        gates.allyColorWarning = NeedsAllyColorWarningRuntimeWork(cfg);
        gates.ammo = gates.ammoActive || !!(State.ammoPanelStyleSig && String(State.ammoPanelStyleSig).length > 0);
        gates.topBarRuntime = NeedsTopBarRuntimeWork(cfg);
        gates.bottomBarRuntime = NeedsBottomBarRuntimeWork(cfg);
        gates.itemsRuntime = NeedsItemsRuntimeWork(cfg);
        gates.soulsRuntime = NeedsSoulsRuntimeWork(cfg);
        gates.heroShop = NeedsHeroShopRuntimeWork(cfg);
        gates.targetShapes = gates.targetShapesActive || !!(
            State.targetShapeHadNonDefaultRuntime ||
            State.targetShapeStyleSig ||
            State.nextTargetShapeRefreshMs ||
            (State.targetShapesCache && State.targetShapesCache.length > 0) ||
            (State.hintContainerCache && State.hintContainerCache.length > 0)
        );
        gates.damageImpactRuntime = NeedsDamageImpactRuntimeWork(cfg);
        gates.staminaChargeColorRuntime = NeedsStaminaChargeColorRuntimeWork(cfg);
        gates.damageNumbers = gates.damageNumbersActive ||
            !!(State.lastIndicatorConfigSig && State.lastIndicatorConfigSig !== DAMAGE_NUMBERS_DEFAULT_RUNTIME_SIG) ||
            State.accountPresetTestActive;
        // minimapRuntime gate resolved via feature registry (extracted to ql_feat_minimapruntime.js)
        var _mmFeat = QOL_FEATURE_REGISTRY["minimapRuntime"];
        gates.minimapRuntime = _mmFeat && _mmFeat.gate ? _mmFeat.gate(cfg, raw) : false;
        // coreRoot is computed first — healthbarRuntimeHelpers is blocked when coreRoot is active
        var _coreRootActive = (State.rootClassCache && State.rootClassCache.panel !== root) || State.coreRootGateSig !== gates.sig || NeedsCoreRootDynamicRuntimeWorkFromState(gates.featureState);
        gates.coreRoot = _coreRootActive;
        gates.healthbarRuntimeHelpers = NeedsHealthbarRuntimeHelperWork(cfg, gates.featureState.healthbarType, gates.featureState.minimalistHealthbarEnabled) && !_coreRootActive;
        gates.panelCache = false;

        // Compass-loop gates — precomputed once per main-loop tick (5Hz) so
        // compassLoop (20Hz) can read from State.lastResolvedGates instead of
        // recomputing 11+ Number() config checks and sticky-state evaluations.
        // WHY: the compass overlay panel hosts BOTH the heading readout and the
        // standalone speed readout. Either feature on its own is enough work to
        // run UpdateCompassOverlay, so the gate must mirror the fallback path
        // (compass OR speed). The root `compass_active` class is still gated on
        // ENABLE_COMPASS alone, so enabling speed never shows the compass dial.
        gates.compassOverlay = IsCfgEnabled(cfg, "ENABLE_COMPASS") ||
            IsCfgEnabled(cfg, "ENABLE_COMPASS_SPEED");
        gates.compassMinimapRotate = IsCfgEnabled(cfg, "MINIMAP_ROTATE_WITH_PLAYER") ||
            IsCfgEnabled(cfg, "MINIMAP_FLIP");
        gates.compassItemMirror = IsPassiveCooldownAdvancedMode(gates.featureState.passiveCooldownMode);
        gates.compassReloadCd = IsCfgEnabled(cfg, "ENABLE_RELOAD_COOLDOWN");
        gates.compassUltCd = IsCfgEnabled(cfg, "ENABLE_ULT_COOLDOWNS");
        gates.compassTargetShapesFast = gates.targetShapesActive;

        // Hard-gate optimization: track whether any runtime feature needs execution.
        // When every gate is false, loop() and compassLoop() can skip gate computation
        // and degrade immediately to deep-idle intervals.
        var _anyGateActive = false;
        for (var _gk in gates) {
            if (_gk !== "sig" && _gk !== "featureState" && gates[_gk] === true) {
                _anyGateActive = true;
                break;
            }
        }
        State.allFeaturesDisabled = !_anyGateActive;

        return gates;
    }

    function ShouldUpdateStartupLoaderOverlay() {
        return !!(State.settingsLoaderSessionActive || State.settingsLoaderSessionCompleted);
    }

    function ShouldUpdateSaveLoaderOverlay() {
        return !!(State.saveSettingsLoaderSessionActive || State.saveSettingsLoaderSessionCompleted);
    }

    function ShouldUpdateClearLoaderOverlay() {
        return !!(State.clearSettingsLoaderSessionActive || State.clearSettingsLoaderSessionCompleted);
    }

    var IMAGES_IN_CHAT_URL_REGEX = /^https?:\/\/\S+\.(?:png|jpg|jpeg|webp|gif)(?:\?\S*)?$/i;
    var IMAGES_IN_CHAT_MAX_W = 150;
    var IMAGES_IN_CHAT_MAX_H = 150;
    var IMAGES_IN_CHAT_CACHE_MAX_MESSAGES = 80;
    var IMAGES_IN_CHAT_FULL_RESCAN_MS = 4000;
    var IMAGES_IN_CHAT_IDLE_MAX_DELAY_MS = 2500;
    function FindChatMessageLabel(msgPanel) {
        var msgText = msgPanel.FindChildTraverse("MessageText");
        if (msgText) return msgText;
        var msgContents = msgPanel.FindChildTraverse("MessageContents");
        if (!msgContents) return null;
        for (var i = 0; i < msgContents.GetChildCount(); i++) {
            var child = msgContents.GetChild(i);
            if (child && child.paneltype === "Label") return child;
        }
        return null;
    }

    function InjectTopChatImage(msgPanel, url) {
        var msgContainer = msgPanel.FindChildTraverse("MessageContents");
        if (!msgContainer) return;
        var msgText = FindChatMessageLabel(msgPanel);
        if (!msgText) return;
        var textContainer = msgText.GetParent();
        if (!textContainer) return;
        textContainer.style.maxWidth = "9999px";
        var panelId = "InjectedChatImage_" + PerfNowMs();
        var img = $.CreatePanel("Image", textContainer, panelId);
        if (!img) {
            $.Msg("[QOLLock][imgchat] FAILED to create Image panel");
            return;
        }
        img.AddClass("InjectedChatImage");
        img.SetImage("https://wsrv.nl/?url=" + encodeURIComponent(url) + "&w=150&h=150&fit=inside");
        img.style.maxWidth = IMAGES_IN_CHAT_MAX_W + "px";
        img.style.maxHeight = IMAGES_IN_CHAT_MAX_H + "px";
        img.style.margin = "8px 8px 8px 8px";
        msgText.style.visibility = "collapse";
        $.Msg("[QOLLock][imgchat] injected \"" + url.substring(0, 60) + "\" on " + panelId);
    }

    function InjectBottomChatImage(msgPanel, url) {
        var msgText = FindChatMessageLabel(msgPanel);
        if (!msgText) return;
        var textContainer = msgText.GetParent();
        if (!textContainer) return;
        textContainer.style.maxWidth = "9999px";
        var panelId = "InjectedChatImage_bot_" + PerfNowMs();
        var img = $.CreatePanel("Image", textContainer, panelId);
        if (!img) {
            $.Msg("[QOLLock][imgchat] FAILED to create Image panel (bottom)");
            return;
        }
        img.AddClass("InjectedChatImage");
        img.SetImage("https://wsrv.nl/?url=" + encodeURIComponent(url) + "&w=150&h=150&fit=inside");
        img.style.maxWidth = IMAGES_IN_CHAT_MAX_W + "px";
        img.style.maxHeight = IMAGES_IN_CHAT_MAX_H + "px";
        img.style.margin = "4px 4px 4px 4px";
        msgText.style.visibility = "collapse";
        $.Msg("[QOLLock][imgchat] injected(bot) \"" + url.substring(0, 60) + "\" on " + panelId);
    }

    function ClearInjectedChatImagesForMessage(msgPanel) {
        if (!IsPanelValid(msgPanel)) return;
        var msgText = FindChatMessageLabel(msgPanel);
        if (msgText) {
            try { msgText.style.visibility = "visible"; } catch(eText) { QOL_WARN("core", "op failed: " + (eText && eText.message ? eText.message : String(eText || ""))); }
        }
        var msgContainer = msgPanel.FindChildTraverse ? msgPanel.FindChildTraverse("MessageContents") : null;
        if (msgContainer) {
            try { msgContainer.style.opacity = 1; } catch(eContainer) { QOL_WARN("core", "op failed: " + (eContainer && eContainer.message ? eContainer.message : String(eContainer || ""))); }
        }
        var textContainer = msgText && msgText.GetParent ? msgText.GetParent() : null;
        if (textContainer && textContainer.Children) {
            var children = textContainer.Children() || [];
            for (var i = 0; i < children.length; i++) {
                var child = children[i];
                if (!child) continue;
                var id = child.id ? String(child.id) : "";
                var isInjected = false;
                if (id.indexOf("InjectedChatImage_") === 0) {
                    isInjected = true;
                } else if (child.BHasClass && child.BHasClass("InjectedChatImage")) {
                    isInjected = true;
                }
                if (isInjected && child.DeleteAsync) {
                    try { child.DeleteAsync(0); } catch(eDelete) { QOL_WARN("core", "op failed: " + (eDelete && eDelete.message ? eDelete.message : String(eDelete || ""))); }
                }
            }
        }
        if (msgPanel.SetHasClass) {
            msgPanel.SetHasClass("imageProcessed", false);
        } else if (msgPanel.RemoveClass) {
            msgPanel.RemoveClass("imageProcessed");
        }
    }

    function GetImagesInChatMessageCache(cacheKey) {
        var cache = State[cacheKey];
        if (!Array.isArray(cache)) {
            cache = [];
            State[cacheKey] = cache;
        }
        return cache;
    }

    function FindImagesInChatMessageCacheEntry(cache, msgPanel) {
        for (var i = 0; i < cache.length; i++) {
            var entry = cache[i];
            if (!entry || !IsPanelValid(entry.panel)) {
                cache.splice(i, 1);
                i--;
                continue;
            }
            if (entry.panel === msgPanel) return entry;
        }
        return null;
    }

    function PruneImagesInChatMessageCache(cache) {
        for (var i = 0; i < cache.length; i++) {
            var entry = cache[i];
            if (!entry || !IsPanelValid(entry.panel)) {
                cache.splice(i, 1);
                i--;
            }
        }
        while (cache.length > IMAGES_IN_CHAT_CACHE_MAX_MESSAGES) {
            cache.shift();
        }
    }

    function BuildImagesInChatContainerWatermark(container) {
        if (!IsPanelValid(container) || !container.GetChildCount) return "";
        var childCount = 0;
        try { childCount = container.GetChildCount(); } catch (eCount) { childCount = 0; }
        var parts = [String(childCount)];
        var start = Math.max(0, childCount - 3);
        for (var i = start; i < childCount; i++) {
            var child = null;
            try { child = container.GetChild(i); } catch (eChild) { child = null; }
            if (!child) {
                parts.push("-");
                continue;
            }
            parts.push(String(child.id || ""));
            var label = null;
            if (child.BHasClass && child.BHasClass("ChatMessage")) {
                label = FindChatMessageLabel(child);
            }
            var text = (label && typeof label.text === "string") ? String(label.text).trim() : "";
            if (text.length > 160) text = text.slice(0, 160);
            parts.push(text);
        }
        return parts.join("|");
    }

    // ── Loop helpers extracted from loop() ──

    function loadLoopConfig(raw, perfLoopStartMs, perfConfigStartMs) {
        var cfg = null;
        if (raw === State.lastRawConfig && State.lastConfig) {
            cfg = State.lastConfig;
        } else {
            cfg = _SPC(raw);
            if (!cfg) {
                cfg = _BDC();
            }
        }
        cfg = ApplyForcedFeatureDisables(cfg);
        UpdatePerfEnabledFromConfig(cfg);
        if (State.perfEnabled) {
            State.perfLoopCount += 1;
            State.perfLastLoopStartMs = perfLoopStartMs;
            PerfRecord("loop.config_load", PerfNowMs() - perfConfigStartMs);
        }
        return cfg;
    }

    function applyBuildCategoryOverride(root, cfg, nowMs, raw) {
        if (QOL.shouldRunBuildCategoryPayloadOverride(root, nowMs)) {
            var perfSection = PerfStart();
            cfg = QOL.applyBuildCategoryPayloadOverride(root, cfg, nowMs, raw);
            cfg = ApplyForcedFeatureDisables(cfg);
            PerfEnd("loop.build_category_payload_override", perfSection);
        }
        return cfg;
    }

    function applyAccountPresetOverride(raw) {
        if (State.accountPresetRawOverride && State.accountPresetRawOverride.length > 0) {
            raw = State.accountPresetRawOverride;
            State.accountPresetRawOverride = "";
        }
        return raw;
    }

    function shouldHardGateEarlyReturn(root, raw) {
        // Skips gate computation and feature execution when nothing is enabled
        // and no pending work exists. Saves ~0.05-0.1ms per tick.
        if (State.allFeaturesDisabled && raw === State.lastRawConfig &&
            !State.heroRestorePendingTarget &&
            !State.settingsLoaderSessionActive && !State.settingsLoaderSessionCompleted &&
            !State.saveSettingsLoaderSessionActive && !State.saveSettingsLoaderSessionCompleted &&
            !State.clearSettingsLoaderSessionActive && !State.clearSettingsLoaderSessionCompleted) {
            return true;
        }
        return false;
    }

    function sweepStalePanelCache(nowMs) {
        var nowSec = Math.floor(nowMs / 1000);
        if (nowSec !== (State.lastCacheSweepSec || 0)) {
            State.lastCacheSweepSec = nowSec;
            var swept = SweepStalePanelCache();
            // Also sweep typed caches (Phase 3 — ql_panelcache.js)
            if (typeof PanelCache !== "undefined" && PanelCache && PanelCache.sweep) {
                swept += PanelCache.sweep();
            }
            if (swept > 0 && State.perfEnabled) {
                QOL_DEBUG("cache", "swept " + swept + " stale panel refs");
            }
        }
    }

    // ── Feature dispatch: order is now derived from the registry (Phase 5) ──
    // Each feature declares its own bucket, phase, gateKey, requiresRoot,
    // perfLabel, and postUpdate via QOL.register(). The dispatch loop
    // iterates QOL_FEATURE_REGISTRY directly — no hardcoded lists.

    // ── Registry-driven feature bucket population (Phase 5) ──
    // Pre-compute sorted registry key list once to avoid per-tick allocation
    var _REGISTRY_KEYS = null;
    function _getRegistryKeys() {
        if (!_REGISTRY_KEYS) _REGISTRY_KEYS = Object.keys(QOL_FEATURE_REGISTRY).sort();
        return _REGISTRY_KEYS;
    }

    function populateFeatureBuckets(buckets, staggerEnabled, loopSnapshot, gates, root) {
        var featureNames = _getRegistryKeys();
        for (var i = 0; i < featureNames.length; i++) {
            var featureName = featureNames[i];
            var featureEntry = QOL_FEATURE_REGISTRY[featureName];
            if (!featureEntry) continue;

            // Gate check — use declared gateKey or fall back to feature name
            var gateKey = featureEntry.gateKey;
            if (!gates[gateKey]) continue;

            // Root guard
            if (featureEntry.requiresRoot && !root) continue;

            var bucketIndex = staggerEnabled ? featureEntry.bucket : 0;
            var perfLabel = featureEntry.perfLabel;

            // IIFE captures per-iteration values (ES5.1: var is function-scoped, not block-scoped)
            buckets[bucketIndex].push((function(fn, entry, label) {
                return function(snapshot) {
                    ExecuteFeature(fn, function() {
                        var perfStartMs = PerfStart();
                        entry.update(snapshot.root, snapshot.cfg, snapshot.nowMs, State, snapshot.hideoutConnected, snapshot.raw);
                        if (entry.postUpdate) entry.postUpdate(snapshot, State);
                        PerfEnd(label, perfStartMs);
                    });
                };
            })(featureName, featureEntry, perfLabel));
        }
    }

    function syncHealthbarAccentColor(root, cfg) {
        var _readAccentIndex = (typeof QOL.resolvePlayerHealthbarAccentColorIndex === "function") ? QOL.resolvePlayerHealthbarAccentColorIndex : function() { return 0; };
        var loopAccentColor = ResolveWashColorFromPalette(_readAccentIndex(cfg));
        var loopAccentNeedsRefresh = (
            loopAccentColor !== "" ||
            !!(State.playerHealthbarAccentColorSig && String(State.playerHealthbarAccentColorSig).length > 0)
        );
        if (State.playerHealthbarAccentColorSig !== State._cachedAccentSigSource) {
            State._cachedAccentSigSource = State.playerHealthbarAccentColorSig;
            State._cachedAccentSigParts = String(State.playerHealthbarAccentColorSig || "").split("|");
        }
        var loopAccentSigParts = State._cachedAccentSigParts;
        var loopCurrentAccentColor = loopAccentSigParts.length > 1 ? loopAccentSigParts[loopAccentSigParts.length - 1] : "";
        if (root && loopAccentNeedsRefresh && loopCurrentAccentColor !== loopAccentColor) {
            var perfStartMs = PerfStart();
            var accentHealthContainer = GetCachedPanel("healthContainer");
            if (!accentHealthContainer && root.FindChildTraverse) {
                accentHealthContainer = root.FindChildTraverse(PANEL_ID_HEALTH_CONTAINER);
                SetCachedPanel("healthContainer", accentHealthContainer);
            }
            if (typeof QOL.applyPlayerHealthbarAccentColor === "function") {
                QOL.applyPlayerHealthbarAccentColor(root, cfg, accentHealthContainer);
            }
            PerfEnd("loop.healthbar_accent_color", perfStartMs);
        }
    }

    function dispatchOrExecuteBuckets(buckets, loopSnapshot) {
        if (FEATURE_STAGGER_ENABLED) {
            if (buckets[0].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_0_MS, buckets[0], loopSnapshot);
            if (buckets[1].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_1_MS, buckets[1], loopSnapshot);
            if (buckets[2].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_2_MS, buckets[2], loopSnapshot);
            if (buckets[3].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_3_MS, buckets[3], loopSnapshot);
            if (buckets[4].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_4_MS, buckets[4], loopSnapshot);
            if (buckets[5].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_5_MS, buckets[5], loopSnapshot);
            if (buckets[6].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_6_MS, buckets[6], loopSnapshot);
            if (buckets[7].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_7_MS, buckets[7], loopSnapshot);
        } else {
            for (var bucketIdx = 0; bucketIdx < buckets[0].length; bucketIdx++) {
                var featureFn = buckets[0][bucketIdx];
                if (featureFn) {
                    try { featureFn(loopSnapshot); } catch (e) {
                        if (typeof $ !== "undefined" && $.Msg) {
                            $.Msg("[QOLLock] feature error: " + (e && e.message ? e.message : String(e)));
                        }
                    }
                }
            }
        }
    }

    function updateLoaderOverlays(root, nowMs) {
        var _settingsLoaderShowing = State.settingsLoaderSessionActive || State.settingsLoaderSessionCompleted;
        if (_settingsLoaderShowing ||
            State.saveSettingsLoaderSessionActive || State.saveSettingsLoaderSessionCompleted ||
            State.clearSettingsLoaderSessionActive || State.clearSettingsLoaderSessionCompleted) {
            if (ShouldUpdateStartupLoaderOverlay()) UpdateSettingsLoaderOverlay(root, nowMs);
            if (!_settingsLoaderShowing && ShouldUpdateSaveLoaderOverlay()) UpdateSaveSettingsLoaderOverlay(root, nowMs);
            if (!_settingsLoaderShowing && ShouldUpdateClearLoaderOverlay()) UpdateClearSettingsLoaderOverlay(root, nowMs);
        }
    }

    function syncDiagnosticState(root, nowMs) {
        try {
            if (typeof QOL_FEATURE_REGISTRY === "undefined") return;
            var diagRoot = State.rootPanel || root;
            var diagHud = (diagRoot && diagRoot.FindChildTraverse) ? diagRoot.FindChildTraverse("Hud") : null;
            // ── Force-sync: Settings context writes a token to QOL_DiagRequest when it
            //     needs an immediate diagnostic snapshot (e.g. after a preset change).
            //     Echo the token in the response so the caller can match it. ──
            var forceSync = false;
            var forceToken = "";
            if (diagHud && diagHud.GetAttributeString) {
                forceToken = diagHud.GetAttributeString("QOL_DiagRequest", "");
                if (forceToken && forceToken !== State._lastDiagForceToken) {
                    State._lastDiagForceToken = forceToken;
                    forceSync = true;
                    QOL_WARN("core", "diag force-sync requested, token=" + String(forceToken).substring(0, 12));
                }
            }
            if (!forceSync && State._diagWriteNextMs && State._diagWriteNextMs > nowMs) return;
            State._diagWriteNextMs = nowMs + 5000;
            var diag = {
                features: Object.keys(QOL_FEATURE_REGISTRY).sort(),
                missing: (State._missingFeatureLogged) ? State._missingFeatureLogged : {},
                errors: (State.featureErrorStreaks) ? State.featureErrorStreaks : {},
                disabled: (State.featureAutoDisabled) ? Object.keys(State.featureAutoDisabled) : [],
                logs: (typeof __qolLogBuf !== "undefined" && __qolLogBuf) ? __qolLogBuf.slice() : [],
                diagToken: forceToken
            };
            // P1: extend diagnostic bridge with FeatureRegistry data.
            // FeatureRegistry is loaded after this function is defined, so guard at call time.
            if (QOL && QOL.core && QOL.core.FeatureRegistry) {
                var FR = QOL.core.FeatureRegistry;
                diag.newFeatures = FR.getRegisteredIds();
                diag.newEnabled = FR.getEnabledIds();
                diag.newErrors = FR.getErrorCounts();
            }
            if (diagHud && diagHud.SetAttributeString) {
                diagHud.SetAttributeString("QOL_Diag", JSON.stringify(diag));
                if (forceSync) {
                    QOL_WARN("core", "diag force-sync written, token=" + String(forceToken).substring(0, 12) + " features=" + diag.features.length + " disabled=" + diag.disabled.length);
                }
            }
        } catch(e) { QOL_WARN("core", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
    }

    function recordLoopPerf(root, cfg, perfLoopStartMs) {
        if (State.perfEnabled) {
            PerfRecord("loop.total", PerfNowMs() - perfLoopStartMs);
            FlushPerfIfNeeded(false);
        }
        if (typeof QOL_PERF_OVERLAY !== "undefined" && QOL_PERF_OVERLAY.UpdateOverlay) {
            QOL_PERF_OVERLAY.UpdateOverlay(root, cfg, State.perfStats);
        }
        RecordFrameTime(PerfNowMs() - perfLoopStartMs);
    }

    function computeDynamicInterval(root, perfLoopStartMs) {
        if (State.perfLastLoopStartMs > 0) {
            State.perfLastFrameTimeMs = perfLoopStartMs - State.perfLastLoopStartMs;
        }
        var idleState = DetectGlobalIdleState(root);
        var dynamicInterval = GetDynamicLoopInterval(LOOP_INTERVAL_SEC, idleState);
        if (idleState.level !== State.lastIdleLevel) {
            if (State.lastIdleLevel !== undefined) {
                QOL_INFO("loop", "idle level: " + State.lastIdleLevel + " -> " + idleState.level +
                         " (interval: " + dynamicInterval.toFixed(2) + "s)");
            }
            State.lastIdleLevel = idleState.level;
        }
        return dynamicInterval;
    }

    // Pre-allocated loop state — reused each tick to avoid per-frame GC
    var _loopSnapshot = {
        root: null, cfg: null, nowMs: 0, gates: null, raw: null,
        hideoutConnected: false, hasConfigSource: false, redDiamondEnabled: false
    };
    var _loopBuckets = [[], [], [], [], [], [], [], []];

    function loop() {
        var nextDelaySec = LOOP_INTERVAL_SEC;
        try {
        ProfileHit("loop");
        var perfLoopStartMs = PerfNowMs();
        var perfConfigStartMs = perfLoopStartMs;
        var root = GetUIRoot();
        var raw = ReadStorageConfigRawFromUi(root);
        TimeFeature("loop.config_read", perfLoopStartMs);

        var cfg = loadLoopConfig(raw, perfLoopStartMs, perfConfigStartMs);
        var nowMsLoop = Date.now ? Date.now() : (new Date()).getTime();
        var corePhase = NextCoreSchedulerPhase();
        if (State.heroRestorePendingTarget) ProcessPendingHeroRestore(nowMsLoop);

        cfg = applyBuildCategoryOverride(root, cfg, nowMsLoop, raw);
        raw = applyAccountPresetOverride(raw);
        State.lastConfig = cfg;
        var hideoutConnected = root ? IsConnectedToHideout(root) : false;
        var hasConfigSource = !!(raw && raw.length > 0);

        // Hard-gate: when all features are disabled and no pending work exists,
        // skip gate computation and feature execution entirely.
        if (shouldHardGateEarlyReturn(root, raw)) {
            if (typeof QOL_PERF_OVERLAY !== "undefined" && QOL_PERF_OVERLAY.UpdateOverlay) {
                QOL_PERF_OVERLAY.UpdateOverlay(root, cfg, State.perfStats);
            }
            State.lastRawConfig = raw;
            nextDelaySec = GetDynamicLoopInterval(LOOP_INTERVAL_SEC, DetectGlobalIdleState(root));
            return;
        }

        sweepStalePanelCache(nowMsLoop);

        var gateResolveStartMs = PerfNowMs();
        var gates = ResolveRuntimeGates(root, cfg, raw, hideoutConnected, hasConfigSource, corePhase);
        TimeFeature("loop.resolve_gates", gateResolveStartMs);
        State.lastResolvedGates = gates;

        // ---- intra-tick feature staggering ----
        // Snapshot shared loop state so deferred $.Schedule callbacks
        // see the correct tick's data even if they fire after the next
        // loop invocation.
        // Reuse pre-allocated snapshot and buckets (mutate in place to avoid per-tick GC)
        var loopSnapshot = _loopSnapshot;
        loopSnapshot.root = root;
        loopSnapshot.cfg = cfg;
        loopSnapshot.nowMs = nowMsLoop;
        loopSnapshot.gates = gates;
        loopSnapshot.raw = raw;
        loopSnapshot.hideoutConnected = hideoutConnected;
        loopSnapshot.hasConfigSource = hasConfigSource;
        loopSnapshot.redDiamondEnabled = gates.redDiamondEnabled;

        var buckets = _loopBuckets;
        for (var _bi = 0; _bi < 8; _bi++) buckets[_bi].length = 0;
        var staggerEnabled = FEATURE_STAGGER_ENABLED ? buckets : null; // null = use bucket 0 only

        populateFeatureBuckets(buckets, staggerEnabled, loopSnapshot, gates, root);
        syncHealthbarAccentColor(root, cfg);
        dispatchOrExecuteBuckets(buckets, loopSnapshot);

        if (State.accountPresetTestActive) {
            State.accountPresetTestActive = false;
        }
        updateLoaderOverlays(root, nowMsLoop);
        State.lastRawConfig = raw;
        syncDiagnosticState(root, nowMsLoop);
        recordLoopPerf(root, cfg, perfLoopStartMs);
        nextDelaySec = computeDynamicInterval(root, perfLoopStartMs);

        } catch (err) {
            LogLoopException("loop", err, "loopErrorNextLogMs", PerfNowMs());
        } finally {
            DumpProfile();
            DumpTiming();
            $.Schedule(nextDelaySec, loop);
        }
    }

    function BootstrapUnitTargetStyles() {
        if (State.unitTargetBootstrapDone) return;
        State.unitTargetBootstrapTryCount = (Number(State.unitTargetBootstrapTryCount) || 0) + 1;

        var root = GetUIRoot();
        if (root) {
            var raw = ReadStorageConfigRawFromUi(root);
            var cfg = null;

            if (raw === State.lastRawConfig && State.lastConfig) {
                cfg = State.lastConfig;
            } else {
                cfg = _SPC(raw);
                if (!cfg) cfg = _BDC();
            }

            // Lazy-init: skip if neither target shapes nor red diamond is enabled (Fix 8)
            if (Number(cfg.ENABLE_TARGET_SHAPES) !== 1 && Number(cfg.ENABLE_RED_DIAMOND) !== 1) {
                State.unitTargetBootstrapDone = true;
                return;
            }

            var style = ResolveUnitTargetStyleTexts(cfg);
            var nowMs = Date.now ? Date.now() : (new Date()).getTime();
            ApplyTargetShapeStyles(root, style.scaleText, style.opacityText, nowMs, IsCfgEnabled(cfg, "ENABLE_RED_DIAMOND"), style.hintScaleText);

            var hasTargetShapes = !!(State.targetShapesCache && State.targetShapesCache.length > 0);
            var hasStoredConfig = (raw && raw.length > 0);
            if (hasTargetShapes && (hasStoredConfig || State.unitTargetBootstrapTryCount >= 2)) {
                State.unitTargetBootstrapDone = true;
                return;
            }
        }

        if (State.unitTargetBootstrapTryCount >= UNIT_TARGET_BOOTSTRAP_MAX_TRIES) {
            State.unitTargetBootstrapDone = true;
            return;
        }

        $.Schedule(UNIT_TARGET_BOOTSTRAP_RETRY_SEC, BootstrapUnitTargetStyles);
    }

    $.Schedule(0.0, BootstrapUnitTargetStyles);
    $.Schedule(CORE_START_DELAY_LOOP_SEC, loop);
    $.Schedule(CORE_START_DELAY_COMPASS_SEC, compassLoop);
    $.Schedule(CORE_START_DELAY_BUILD_SEC, buildRequestLoop);

    // ── Feature registrations (Phase 2: registry-based dispatch) ──

    // ── Batch C: features with significant State footprint ──


    QOL_REGISTER_FEATURE("coreRoot", {
        configKeys: ["HUD_TOP_BAR_ENABLED", "HUD_BOTTOM_BAR_ENABLED",
                     "HUD_ITEMS_ENABLED", "HUD_SOULS_ENABLED", "HUD_SHOP_ENABLED",
                     "ENABLE_CHAT", "ENABLE_CENTER_ESC", "ENABLE_CENTER_FRIENDS_LIST",
                     "SUPPORT_16_10", "SUPPORT_4_3", "HUD_INDICATOR_SIZE",
                     "ENABLE_SPECIALS", "LANGUAGE", "ENABLE_GAME_AUDIO",
                     "DISABLE_DAMAGE_REPORT", "DISABLE_QUICK_BUY",
                     "ENABLE_LEGACY_COOLDOWNS", "ENABLE_HIDE_TESTING_TOOLS",
                     "ENABLE_FORCE_TESTING_TOOLS", "ENABLE_COMBAT_INDICATOR",
                     "ENABLE_ZIP_BOOST", "ENABLE_STAT_BONUSES", "ENABLE_COMPASS",
                     "ENABLE_ENHANCED_QUICKBUY", "ENABLE_SHOP_ITEM_NOTIFICATIONS",
                     "ENABLE_SHOP_RECENT_PURCHASES", "ENABLE_HERO_PURCHASE_POPUPS",
                     "ENABLE_SHOW_BUILD_ID", "ENABLE_HUD_SHIFT",
                     "ENABLE_MINIMALISTIC_PAUSE"],
        bucket: 0, phase: 0,
        requiresRoot: true,
        perfLabel: "loop.root_classes",
        gate: function(cfg) { return true; },  // coreRoot always evaluates
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            ApplyCoreLoopRootClassesAndState(root, cfg, nowMs, hideoutConnected,
                !!(State.lastRawConfig && State.lastRawConfig.length > 0));
        },
        postUpdate: function(snapshot, State) {
            State.coreRootGateSig = snapshot.gates.sig;
        },
        stateKeys: ["rootClassCache", "coreRootStaticSig", "coreRootGateSig"]
    });






    // =========================================================================
    // §18 Global bridge — exported for per-feature files in features/
    // =========================================================================
    // Features extracted to separate files lose IIFE closure access to State,
    // cache helpers, and perf tools. This bridge publishes them on window so
    // feature files can use the same APIs without being inline in ql_core.js.
    //
    // Load order: ql_utils.js → ql_shared_presets.js → ql_core.js → features/*.js
    //
    // Feature files should use:
    //   QOL_STATE.*                  (was: State.*)
    //   QOL_GetCachedPanel(id)       (was: GetCachedPanel(id))
    //   QOL_SetCachedPanel(id, p)    (was: SetCachedPanel(id, p))
    //   QOL_ClearPanelCache()        (was: ClearPanelCache())
    //   QOL_ResolveCachedPanel(...)  (was: ResolveCachedPanel(...))
    //   QOL_PerfStart()              (was: PerfStart())
    //   QOL_PerfEnd(name, startMs)   (was: PerfEnd(name, startMs))
    //   QOL_ExecuteFeature(name, fn) (was: ExecuteFeature(name, fn))
    //
    // QOL_UTILS exports (already global): IsPanelValid, IsCfgEnabled,
    //   SafeGetAttribute, SafeSetAttribute, PushUnique, PerfNowMs,
    //   DebugLog/InfoLog/WarnLog/ErrorLog, SetStyleSafe/ClearStyleSafe,
    //   SetPanelOpacitySafe, SetPanelVisibility, NormalizeOpacityNumber,
    //   NormalizeHudOffsetNumber, FormatHudPx, NormalizeHudScaleNumber,
    //   NormalizeDegrees360/180, ShortestDegreesDelta
    // =========================================================================
    // QOL bridge — publish all exports to the shared QOL namespace
    // QOL is defined by ql_shared_presets.js (loaded before us)
    // Feature files use QOL.import([...]) to resolve dependencies
    // =========================================================================
    // Reuse the QOL namespace from ql_shared_presets.js (QOL.import, QOL.register,
    // QOL.utils live there). Must read through globalThis/window because a local
    // var QOL would hoist and shadow the global, losing QOL.import.
    // Panorama has globalThis but not always window, so check globalThis first.
    var QOL = null;
    if (typeof globalThis !== "undefined" && globalThis.QOL) {
        QOL = globalThis.QOL;
    } else if (typeof window !== "undefined" && window.QOL) {
        QOL = window.QOL;
    }
    if (!QOL) {
        $.Msg("[QOLLock][BRIDGE] QOL namespace not found on globalThis or window — ql_shared_presets.js may not have loaded. Feature imports will fail.");
        QOL = {};
    }

    // Lazy-getter array: each getter is a function that returns the value.
    // Wrapping in a function defers the identifier resolution until the
    // try/catch loop runs, so a single missing symbol doesn't crash the script.
    var _qolExportDefs = [

        ["buildImagesInChatContainerWatermark", function() { return BuildImagesInChatContainerWatermark; }],
        ["buildKeyboardOverlayLayouts", function() { return BuildKeyboardOverlayLayouts; }],
        ["clearInjectedChatImagesForMessage", function() { return ClearInjectedChatImagesForMessage; }],
        ["detectTopBarPlayerTeam", function() { return DetectTopBarPlayerTeam; }],
        ["ensureAbilitiesContainerPanelCache", function() { return EnsureAbilitiesContainerPanelCache; }],
        ["ensureCachedPanelByIds", function() { return EnsureCachedPanelByIds; }],
        ["ensureGameTimePanelCache", function() { return EnsureGameTimePanelCache; }],
        ["ensureMinimapOverlayAnchor", function() { return EnsureMinimapOverlayAnchor; }],
        ["ensureMinimapPanelCache", function() { return EnsureMinimapPanelCache; }],
        ["ensurePassiveHudPanelCache", function() { return EnsurePassiveHudPanelCache; }],
        ["ensureSpmState", function() { return EnsureSpmState; }],
        ["estimateUnsecuredSoulsEtaFallbackSec", function() { return EstimateUnsecuredSoulsEtaFallbackSec; }],
        ["extractStatDisplayText", function() { return ExtractStatDisplayText; }],
        ["findChatMessageLabel", function() { return FindChatMessageLabel; }],
        ["findImagesInChatMessageCacheEntry", function() { return FindImagesInChatMessageCacheEntry; }],
        ["findNumericLabelTextInTree", function() { return FindNumericLabelTextInTree; }],
        ["findUnsecuredSoulsSource", function() { return FindUnsecuredSoulsSource; }],
        ["findZipBoostSource", function() { return FindZipBoostSource; }],
        ["getCachedPanel", function() { return GetCachedPanel; }],
        ["getGameSecondsForUrn", function() { return GetGameSecondsForUrn; }],
        ["getGameplayHudPanel", function() { return GetGameplayHudPanel; }],
        ["getHighestRejuvChargeTokenOnPanel", function() { return GetHighestRejuvChargeTokenOnPanel; }],
        ["getUnitTargetDefaultStyleTexts", function() { return GetUnitTargetDefaultStyleTexts; }],
        ["hasClassInHierarchy", function() { return (typeof QOL_UTILS !== "undefined") ? QOL_UTILS.HasClassInHierarchy : function() { return false; }; }],
        ["getImagesInChatMessageCache", function() { return GetImagesInChatMessageCache; }],
        ["getKeyboardCachedPanels", function() { return GetKeyboardCachedPanels; }],
        ["getSharedSchemaUtils", function() { return (typeof QOL !== "undefined" && QOL.getSharedSchemaUtils) || (function() { return null; }); }],
        ["getSoulValueFromLabels", function() { return GetSoulValueFromLabels; }],
        ["getTopBarPlayerPanel", function() { return GetTopBarPlayerPanel; }],
        ["getUIRoot", function() { return GetUIRoot; }],
        ["getUnsecuredSoulsDangerLevel", function() { return GetUnsecuredSoulsDangerLevel; }],
        ["harvestGoldenStatuesTooltipValue", function() { return HarvestGoldenStatuesTooltipValue; }],
        ["injectBottomChatImage", function() { return InjectBottomChatImage; }],
        ["injectTopChatImage", function() { return InjectTopChatImage; }],
        ["isColorWarningEnabled", function() { return IsColorWarningEnabled; }],
        ["isCombatSignalActive", function() { return IsCombatSignalActive; }],
        ["isConnectedToHideout", function() { return IsConnectedToHideout; }],
        ["isCustomHudContextActive", function() { return IsCustomHudContextActive; }],
        ["isHudClassActive", function() { return IsHudClassActive; }],
        ["isHudVisibleForTopBarRuntime", function() { return IsHudVisibleForTopBarRuntime; }],
        ["isPanelListValid", function() { return IsPanelListValid; }],
        ["isPanelVisibleMaybe", function() { return IsPanelVisibleMaybe; }],
        ["isPassiveCooldownBasicMode", function() { return IsPassiveCooldownBasicMode; }],
        ["isStartupLoaderInActiveMatchContext", function() { return IsStartupLoaderInActiveMatchContext; }],
        ["isStatBonusTokenZero", function() { return IsStatBonusTokenZero; }],
        ["isStreetBrawlModeActive", function() { return IsStreetBrawlModeActive; }],
        ["normalizeDamageImpactScaleNumber", function() { return NormalizeDamageImpactScaleNumber; }],
        ["normalizeHudOffsetNumber", function() { return NormalizeHudOffsetNumber; }],
        ["normalizeHudScaleNumber", function() { return NormalizeHudScaleNumber; }],
        ["normalizePaletteColorIndex", function() { return NormalizePaletteColorIndex; }],
        ["normalizeStaminaChargeAngle", function() { return NormalizeStaminaChargeAngle; }],
        ["normalizeAmmoClipAngle", function() { return NormalizeAmmoClipAngle; }],
        ["normalizeVoiceTypeValue", function() { return (typeof QOL !== "undefined" && QOL.normalizeVoiceTypeValue) || (function(v) { var asInt = Math.round(Number(v)); if (asInt === 4 || asInt === 0 || asInt === 5 || asInt === 6 || asInt === 7 || asInt === 8) return asInt; return 0; }); }],
        ["normalizeVoiceVolumeValue", function() { return (typeof QOL !== "undefined" && QOL.normalizeVoiceVolumeValue) || (function(v) { var asInt = Math.round(Number(v)); if (!isFinite(asInt)) asInt = 100; if (asInt < 0) asInt = 0; if (asInt > 100) asInt = 100; return asInt; }); }],
        ["parseClockSeconds", function() { return ParseClockSeconds; }],
        ["parseUnsecuredSoulsValue", function() { return ParseUnsecuredSoulsValue; }],
        ["perfEnd", function() { return PerfEnd; }],
        ["perfNowMs", function() { return PerfNowMs; }],
        ["perfStart", function() { return PerfStart; }],
        ["pruneImagesInChatMessageCache", function() { return PruneImagesInChatMessageCache; }],
        ["readAmmoTextColorIndex", function() { return ReadAmmoTextColorIndex; }],
        ["readBottomBarWashColorIndex", function() { return ReadBottomBarWashColorIndex; }],
        ["readKeyboardOverlayWashColorIndex", function() { return ReadKeyboardOverlayWashColorIndex; }],
        ["readStaminaChargeColorIndex", function() { return ReadStaminaChargeColorIndex; }],
        ["refreshSpmPanelCache", function() { return RefreshSpmPanelCache; }],
        ["resetKeyboardOverlayCaches", function() { return ResetKeyboardOverlayCaches; }],
        ["resetUnsecuredSoulsTracking", function() { return ResetUnsecuredSoulsTracking; }],
        ["resolveCachedPanel", function() { return ResolveCachedPanel; }],
        ["resolveDamageNumbersRuntimeSig", function() { return ResolveDamageNumbersRuntimeSig; }],
        ["resolveGoldenStatBonusesValue", function() { return ResolveGoldenStatBonusesValue; }],
        ["resolvePassiveCooldownMode", function() { return ResolvePassiveCooldownMode; }],
        ["resolveStatBonusesSource", function() { return ResolveStatBonusesSource; }],

        ["resolveWashColorFromPalette", function() { return ResolveWashColorFromPalette; }],
        ["runtimeTaskIsDue", function() { return RuntimeTaskIsDue; }],
        ["runtimeTaskSetDelay", function() { return RuntimeTaskSetDelay; }],
        ["setCachedPanel", function() { return SetCachedPanel; }],
        ["setPanelClassCached", function() { return SetPanelClassCached; }],
        ["activatePanelSafe", function() { return ActivatePanelSafe; }],
        ["findAncestorWithClass", function() { return (typeof QOL_UTILS !== "undefined") ? QOL_UTILS.FindAncestorWithClass : function() { return null; }; }],
        ["readPanelIdTextMaybe", function() { return ReadPanelIdTextMaybe; }],
        ["readPanelTextDeepMaybe", function() { return ReadPanelTextDeepMaybe; }],
        ["panelHasClassToken", function() { return PanelHasClassToken; }],
        ["panelIdGoldApContainer", function() { return PANEL_ID_GOLD_AP_CONTAINER; }],
        ["panelIdSignature", function() { return PANEL_ID_SIGNATURE; }],
        ["panelIdTopBar", function() { return PANEL_ID_TOP_BAR; }],
        ["readMinimapIconColorIndex", function() { return ReadMinimapIconColorIndex; }],
        ["setPanelClassIfChanged", function() { return SetPanelClassIfChanged; }],
        ["setWashColorSafe", function() { return SetWashColorSafe; }],
        ["statBonusesDebugLogThrottled", function() { return StatBonusesDebugLogThrottled; }],
        ["state", function() { return State; }],
        ["tryGetGameplayMouseCursorPosition", function() { return TryGetGameplayMouseCursorPosition; }],
        ["readPanelTextMaybe", function() { return ReadPanelTextMaybe; }],
        ["extractBuildCategoryPayloadToken", function() { return ExtractBuildCategoryPayloadToken; }],
        ["getAccountIdForBuildCategoryPayload", function() { return (typeof QOL !== "undefined" && QOL.getAccountIdForBuildCategoryPayload) || (function() { return ""; }); }],
        ["confirmStorageHeroSignatureAbilities", function() { return ConfirmStorageHeroSignatureAbilities; }],
        ["ensureStorageBuildInitialized", function() { return EnsureStorageBuildInitialized; }],
        ["resolvePlayableHeroAlias", function() { return ResolvePlayableHeroAlias; }],
        ["resolveBuildSaveStorageHeroSignal", function() { return ResolveBuildSaveStorageHeroSignal; }],
        ["tryReadBuildSaveStorageHeroFromSettings", function() { return TryReadBuildSaveStorageHeroFromSettings; }],
        ["tryReadSelectedHeroIncludingStorageFromCommandPanels", function() { return TryReadSelectedHeroIncludingStorageFromCommandPanels; }],
        ["extractHeroTokenFromText", function() { return ExtractHeroTokenFromText; }],
        ["finalizeSaveSettingsLoaderSession", function() { return FinalizeSaveSettingsLoaderSession; }],
        ["beginSaveSettingsLoaderSession", function() { return BeginSaveSettingsLoaderSession; }],
        ["updateSaveSettingsLoaderFromBuildSaveState", function() { return UpdateSaveSettingsLoaderFromBuildSaveState; }],
        ["setSaveSettingsLoaderStepState", function() { return SetSaveSettingsLoaderStepState; }],
        ["getSaveSettingsLoaderStepState", function() { return GetSaveSettingsLoaderStepState; }],
        ["beginSettingsLoaderSession", function() { return BeginSettingsLoaderSession; }],
        ["finalizeSettingsLoaderSession", function() { return FinalizeSettingsLoaderSession; }],
        ["resetSettingsLoaderSession", function() { return ResetSettingsLoaderSession; }],
        ["saveSettingsLoaderEnabled", function() { return SAVE_SETTINGS_LOADER_ENABLED; }],
        ["pulseShopAfterBuildPayloadStartupReturn", function() { return PulseShopAfterBuildPayloadStartupReturn; }],
        ["buildDefaultConfig", function() { return (typeof QOL !== "undefined" && QOL.buildDefaultConfig) || _BDC; }],
        ["heroReturnDebugLog", function() { return HeroReturnDebugLog; }],
        ["settingsLoaderDebugLogThrottled", function() { return SettingsLoaderDebugLogThrottled; }],
        ["setSettingsLoaderDebugOverlayLine", function() { return SetSettingsLoaderDebugOverlayLine; }],
        ["buildDefaultPayloadToken", function() { return BuildDefaultPayloadToken; }],
        ["buildPayloadFromBase64Url", function() { return BuildPayloadFromBase64Url; }],
        ["captureBuildSaveTargetSelection", function() { return CaptureBuildSaveTargetSelection; }],
        ["collectStorageBuildEntryPanels", function() { return CollectStorageBuildEntryPanels; }],
        ["deserializeBuildPayloadCompact", function() { return DeserializeBuildPayloadCompact; }],
        ["ensureShopFavoritesNavActive", function() { return EnsureShopFavoritesNavActive; }],
        ["ensureStorageHeroFavoritesHeaderVisible", function() { return EnsureStorageHeroFavoritesHeaderVisible; }],
        ["enterStartupCorruptRepairPrompt", function() { return EnterStartupCorruptRepairPrompt; }],
        ["extractLastHeroTokenFromText", function() { return ExtractLastHeroTokenFromText; }],
        ["findBrowseBuildsButton", function() { return FindBrowseBuildsButton; }],
        ["getBuildSaveHudPanel", function() { return GetBuildSaveHudPanel; }],
        ["getLoaderBaseDefaultHeroId", function() { return GetLoaderBaseDefaultHeroId; }],
        ["getSaveSettingsLoaderDetailForMessage", function() { return GetSaveSettingsLoaderDetailForMessage; }],
        ["hasBuildSaveStorageUiReady", function() { return HasBuildSaveStorageUiReady; }],
        ["isBrowseBuildsPopupOpen", function() { return IsBrowseBuildsPopupOpen; }],
        ["isBuildSaveStorageRuntimeSourceStale", function() { return IsBuildSaveStorageRuntimeSourceStale; }],
        ["isBuildSaveTargetSelectionMatch", function() { return IsBuildSaveTargetSelectionMatch; }],
        ["isStartupCorruptRepairPending", function() { return IsStartupCorruptRepairPending; }],
        ["isStorageBuildListEmpty", function() { return IsStorageBuildListEmpty; }],
        ["mergeConfig", function() { return (typeof QOL !== "undefined" && QOL.mergeConfig) || _MC; }],
        ["queueBuildSaveRequestFromLoader", function() { return QueueBuildSaveRequestFromLoader; }],
        ["resetBuildClearRequestAttributes", function() { return ResetBuildClearRequestAttributes; }],
        ["resetBuildClearRuntimeState", function() { return ResetBuildClearRuntimeState; }],
        ["resetBuildLoaderForTempDisable", function() { return ResetBuildLoaderForTempDisable; }],
        ["resetStartupDefaultPayloadBootstrapState", function() { return ResetStartupDefaultPayloadBootstrapState; }],
        ["setSettingsLoaderStepState", function() { return SetSettingsLoaderStepState; }],
        ["setStartupCorruptRepairPending", function() { return SetStartupCorruptRepairPending; }],
        ["settingsLoaderBuildProbeSnapshot", function() { return SettingsLoaderBuildProbeSnapshot; }],
        ["settingsLoaderDebugLog", function() { return SettingsLoaderDebugLog; }],
        ["settingsLoaderTraceLogThrottled", function() { return SettingsLoaderTraceLogThrottled; }],
        ["stepCorruptRepairClearStorageBuilds", function() { return StepCorruptRepairClearStorageBuilds; }],
        ["suppressStartupLoaderForSession", function() { return SuppressStartupLoaderForSession; }],
        ["traceSettingsLoaderProbeHeartbeat", function() { return TraceSettingsLoaderProbeHeartbeat; }],
        ["tryCloseBrowseBuildsPopupForLoader", function() { return TryCloseBrowseBuildsPopupForLoader; }],
        ["tryCloseHeroShopForLoader", function() { return TryCloseHeroShopForLoader; }],
        ["tryDismissBuildDeletePopup", function() { return TryDismissBuildDeletePopup; }],
        ["tryOpenHeroShopForHeroProbe", function() { return TryOpenHeroShopForHeroProbe; }],
        ["tryReadAccountIdFromKnownPartyPath", function() { return TryReadAccountIdFromKnownPartyPath; }],
        ["tryReselectBuildSaveTargetByTitle", function() { return TryReselectBuildSaveTargetByTitle; }],
        ["trySelectFirstStorageBuildEntry", function() { return TrySelectFirstStorageBuildEntry; }],
        ["trySelectNextStorageBuildEntry", function() { return TrySelectNextStorageBuildEntry; }],
        ["writeStorageConfigRawToUi", function() { return WriteStorageConfigRawToUi; }],
        ["washColorPalette", function() { return QOL_WASH_COLOR_PALETTE; }],
        // Bridge for healthbar feature — these are set by ql_feat_healthbar.js at load time,
        // but coreRoot needs to call them. Fallback no-ops ensure safe loading order.
        ["isHudVisibleForPlayerHealthbarRuntime", function() { return IsHudVisibleForPlayerHealthbarRuntime; }],
        ["hasNonDefaultPlayerHealthbarRuntimeConfig", function() { return HasNonDefaultPlayerHealthbarRuntimeConfig; }],
        ["needsHealthbarRuntimeHelperWork", function() { return NeedsHealthbarRuntimeHelperWork; }],
        ["tryReadHeroFromPanelDetails", function() { return TryReadHeroFromPanelDetails; }],
    ];

    // Publish to QOL namespace with error logging
    var _qolFailed = [];
    for (var _ei = 0; _ei < _qolExportDefs.length; _ei++) {
        var _ek = _qolExportDefs[_ei][0];
        var _getter = _qolExportDefs[_ei][1];
        try {
            QOL[_ek] = _getter();
        } catch(e) {
            _qolFailed.push(_ek + " [" + (e && e.message ? e.message : String(e)) + "]");
        }
    }
    if (_qolFailed.length > 0) {
        $.Msg("[QOLLock][BRIDGE] failed to export " + _qolFailed.length + " symbol(s): " + _qolFailed.join(", "));
    }

    // Publish namespace to global scope
    try { if (typeof window !== "undefined") window.QOL = QOL; } catch(e) { QOL_WARN("core", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
    try { if (typeof globalThis !== "undefined") globalThis.QOL = QOL; } catch(e) { QOL_WARN("core", "op failed: " + (e && e.message ? e.message : String(e || ""))); }







})();

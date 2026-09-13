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
    try { if (typeof globalThis !== "undefined") globalThis.ToggleQollockDebug = ToggleQollockDebug; } catch(e) { QOL_WARN("core", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
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
    // Phase slot assignments (which feature runs in which corePhase % 5)
    const CORE_PHASE_REJUV_NICKNAMES = 0;
    const CORE_PHASE_SPM_STATLOCKER  = 1;
    const CORE_PHASE_UNSPENT_LANE    = 2;
    const CORE_PHASE_UNSECURED       = 3;

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

    // Compass idle degradation — uses idle interval when not in custom HUD context

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

    // ==========================================================================
    // MINIMAP — ROTATION SMOOTHING
    // ==========================================================================
    // North-offset rotation uses an exponential moving average ("tau" = time constant).
    // Two tau values: fast for large heading deltas, slow for small corrections.

    // ==========================================================================
    // MINIMAP — LAYOUT & SCANNING
    // ==========================================================================
    // WHY: minimap player position scanning at 250ms (4Hz) balances smooth rotation
    // with CPU cost. 90ms fast-path used after teleports/respawns for instant snap.
    // Cap for the escalating backoff applied after repeated scan misses. See
    // NextMinimapScanBackoffMs.
    const GAMEPLAY_MOUSE_CURSOR_ENABLED = true;             // WHY: feature-gate constant — set false to globally disable the custom cursor without touching config
    // WHY: zip boost ready flash lasts 2s — long enough to notice, short enough to not distract during combat
    const ZIP_BOOST_READY_FLASH_MS = 2000;
    // WHY: combat recovery at 3s matches the game's own out-of-combat timer (player stops taking damage for 3s)
    // WHY: enemy health panel scanning at 1200ms — full-tree scan is expensive;
    // 1200ms is the sweet spot where health changes are still visible quickly
    // but the scan cost is amortized over many frames
    const ENEMY_COLORED_HEALTH_DEBUG = false;               // WHY: debug gate — must be false in production; enables per-panel color dump every ~700ms
    // ---- Unsecured Souls overlay ----
    // WHY: source search at 1000ms — the unsecured souls HUD panel doesn't move;
    // re-scanning faster than 1Hz provides no benefit while wasting CPU
    // WHY: EMA alpha of 0.35 gives ~3-sample smoothing window (1/α ≈ 2.86),
    // enough to filter jitter without introducing perceptible lag in the rate display
    const UNSECURED_SOULS_RATE_EMA_ALPHA = 0.35;
    // WHY: fallback drain at 0.5%/sec — conservative estimate when rate tracking
    // is stale; matches observed unsecured soul decay in testing
    const UNSECURED_SOULS_FALLBACK_PCT_DRAIN = 0.005;
    const UNSECURED_SOULS_FALLBACK_BASE_FLAT = 1.6;
    const UNSECURED_SOULS_FALLBACK_FLAT_GROWTH = 0.08;
    const UNSECURED_SOULS_THRESH_YELLOW = 500;
    const UNSECURED_SOULS_THRESH_RED = 1000;
    // Healthbar type enum (matches ql_settings.js healthbar type dropdown order)
    const HEALTHBAR_TYPE_DEFAULT    = 0;
    const HEALTHBAR_TYPE_MINIMALIST = 1;
    const HEALTHBAR_TYPE_FG         = 2;
    const HEALTHBAR_TYPE_KLUTZ      = 3;
    const HEALTHBAR_TYPE_BUDHUD     = 4;
    const HEALTHBAR_TYPE_MINECRAFT  = 5;
    const COLORED_HEALTHBAR_COLOR_WHITE = [255, 255, 255];
    // TEMP TEST SWITCH: keep base + optimize item cooldown paths enabled together for offset alignment checks.
    const ITEM_COOLDOWN_DUAL_MODE_TEST = false;
    // WHY: max 13 players covers 6v6 (12) + 1 extra slot for spectators/bots.
    // SPM window of 60 samples at 1s intervals = 60s rolling average.
    const SPM_MAX_PLAYERS = 13;
    // WHY: panel cache at 7s — SPM changes slowly (1 sample/sec), re-scanning
    // faster provides no benefit while wasting CPU on tree walks
    const TOPBAR_PLAYER_PANEL_CACHE_REFRESH_MS = 1500;
    // Cooldown for a slot that has never resolved. Deliberately far longer than the
    // stale-cache refresh above: the cost of re-checking is a whole-HUD walk (31k
    // panels measured), and the only slot that behaves this way is one the engine
    // never creates. Still bounded so a genuinely late-arriving panel is picked up.
    const TOPBAR_PLAYER_PANEL_MISSING_RECHECK_MS = 30000;
    // WHY: nickname refresh at 1s initially, then 4.2s once stable — player names
    // WHY: 280ms sample interval (~3.6Hz) — fast enough to catch soul swings during
    // urn fights, slow enough to not dominate the main loop budget
    const URN_TRACKER_SAMPLE_INTERVAL_MS = 280;
    const URN_TRACKER_PANEL_CACHE_REFRESH_MS = 4200;
    const ACCOUNT_PROBE_LOG = false;
    const URN_TRACKER_DEBUG = false;
    const PERF_DEBUG_FLUSH_MS = 10000;     // snapshot capture interval
    const PERF_ROLLING_WINDOW_MS = 60000;  // merged reporting window
    const PERF_MAX_SNAPSHOTS = 12;         // ring buffer size
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
    const PANEL_ID_SIGNATURE = "hud_signature";
    const PANEL_ID_SHOP_MODS_SELECTED_BUILD = "ShopModsSelectedBuild";
    const BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID = "hero_skyrunner";
    const BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS = 100;  // minimal UI settle time
const BUILD_CATEGORY_PAYLOAD_SCHEMA_SEMVER = (typeof QOL_SCHEMA_SEMVER === "string" && QOL_SCHEMA_SEMVER.length > 0)
    ? QOL_SCHEMA_SEMVER
    : "2.3.5";
    const BUILD_CATEGORY_PAYLOAD_SCHEMA_TOKEN_VERSION = String(BUILD_CATEGORY_PAYLOAD_SCHEMA_SEMVER || "").replace(/\./g, "-");
    const BUILD_CATEGORY_PAYLOAD_EXPORT_PREFIX = "[QOL-" + BUILD_CATEGORY_PAYLOAD_SCHEMA_TOKEN_VERSION + "]:";
    const BUILD_CATEGORY_PAYLOAD_TOKEN_REGEX = /^\[QOL-(\d+-\d+-\d+)\]:([A-Za-z0-9\-_]+)$/i;
    const BUILD_CATEGORY_PAYLOAD_TOKEN_EXTRACT_REGEX = /(\[QOL-\d+-\d+-\d+\]:[A-Za-z0-9\-_]+)/i;
    const BUILD_CATEGORY_PAYLOAD_POST_SWITCH_SHOP_OPEN_DELAY_SEC = 0.05;  // poll-driven
    const BUILD_CATEGORY_PAYLOAD_POST_SWITCH_SHOP_CLOSE_DELAY_SEC = 0.05; // poll-driven
    // Settings loader constants extracted to core/ql_settings_loader.js
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
    // (Build save/clear + hero hint bridge constants now live in ql_bridge.js — Phase 4)
    const BUILD_CORRUPT_REPAIR_PENDING_ATTR = "QOL_CORRUPT_REPAIR_PENDING";
    const BUILD_SAVE_RETURN_HERO_ID = "hero_werewolf";
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
    const HERO_RETURN_DEBUG = false;
    const HERO_RETURN_DEBUG_THROTTLE_MS = 350;
    const HERO_SELECT_COMMAND_SCAN_MAX_PANELS = 2500;
    const HERO_RESTORE_RETRY_DELAY_MS = 350;
    const HERO_RESTORE_MAX_WAIT_MS = 3200;
    const HERO_RESTORE_MAX_RETRIES = 1;
    const HERO_RESTORE_BLIND_SUCCESS_MS = 800;   // reduced from 1300
    // Repeated CSS class names
    const CLASS_OUT_OF_COMBAT = "out_of_combat";
    const CLASS_IN_COMBAT = "inCombat";

    // Phase A.2: 16 MC constants removed — already extracted to ql_feat_healthbar.js.


    function UrnTrackerLog(msg) {
        if (!URN_TRACKER_DEBUG) return;
        $.Msg("[QOLLock][UrnTracker] " + msg);
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

    function _TLog(label, detail) {
        try { $.Msg("[QOLLock][TRACE][" + (label || "") + "] " + (detail || "")); } catch(e) { QOL_WARN("core", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
    }

    // Settings loader logging & theme helpers extracted to core/ql_settings_loader.js
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



    function PerfNowMs() {
        return Date.now ? Date.now() : (new Date()).getTime();
    }

    // Module-level cache of State.perfEnabled — avoids repeated property lookups
    // across 70+ PerfStart/PerfEnd calls per tick when perf tracking is off.
    var _perfTrackingActive = false;
    var _perfConsoleActive = false;
    var _perfDisabledStateClean = false;

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

    function _copyPerfEntries(stats) {
        if (!stats) return null;
        var keys = Object.keys(stats);
        if (keys.length === 0) return null;
        var copy = {};
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var e = stats[k];
            if (e && e.count > 0) {
                copy[k] = { total: e.total, count: e.count, max: e.max, slow: e.slow || 0 };
            }
        }
        return Object.keys(copy).length > 0 ? copy : null;
    }

    function _mergePerfSnapshots(snapshots, liveStats) {
        var merged = {};
        for (var si = 0; si < snapshots.length; si++) {
            var snap = snapshots[si];
            if (!snap || !snap.entries) continue;
            var keys = Object.keys(snap.entries);
            for (var ki = 0; ki < keys.length; ki++) {
                var k = keys[ki];
                var e = snap.entries[k];
                if (!merged[k]) merged[k] = { total: 0, count: 0, max: 0, slow: 0 };
                merged[k].total += e.total;
                merged[k].count += e.count;
                if (e.max > merged[k].max) merged[k].max = e.max;
                merged[k].slow += e.slow || 0;
            }
        }
        // Merge live stats
        if (liveStats) {
            var lKeys = Object.keys(liveStats);
            for (var li = 0; li < lKeys.length; li++) {
                var lk = lKeys[li];
                var le = liveStats[lk];
                if (!le || le.count <= 0) continue;
                if (!merged[lk]) merged[lk] = { total: 0, count: 0, max: 0, slow: 0 };
                merged[lk].total += le.total;
                merged[lk].count += le.count;
                if (le.max > merged[lk].max) merged[lk].max = le.max;
                merged[lk].slow += le.slow || 0;
            }
        }
        return merged;
    }

    function ResetPerfWindow(nowMs) {
        if (_perfConsoleActive) {
            // Console diagnostics keep a 60s history. The on-screen overlay has
            // its own rolling buffer and does not need this duplicate copy.
            var snap = _copyPerfEntries(State.perfStats);
            if (snap) {
                if (!State.perfSnapshotRing) State.perfSnapshotRing = [];
                var prevLen = State.perfSnapshotRing.length;
                State.perfSnapshotRing.push({ timeMs: nowMs, entries: snap });
                var cutoff = nowMs - PERF_ROLLING_WINDOW_MS;
                var pruned = 0;
                while (State.perfSnapshotRing.length > 0 && State.perfSnapshotRing[0].timeMs < cutoff) {
                    State.perfSnapshotRing.shift();
                    pruned++;
                }
                while (State.perfSnapshotRing.length > PERF_MAX_SNAPSHOTS) {
                    State.perfSnapshotRing.shift();
                }
                $.Msg("[QOLLock][Perf][ring] captured snapshot entries=" + Object.keys(snap).length +
                      " ringSize=" + prevLen + "→" + State.perfSnapshotRing.length +
                      " pruned=" + pruned + " cutoffAge=" + Math.round((nowMs - cutoff)/1000) + "s");
            }
        } else {
            State.perfSnapshotRing = null;
        }
        State.perfStats = {};
        State.perfWindowStartMs = nowMs;
        State.perfNextFlushMs = nowMs + PERF_DEBUG_FLUSH_MS;
        State.perfLoopCount = 0;
        State.perfCompassLoopCount = 0;
    }

    function UpdatePerfEnabledFromConfig(cfg) {
        var consoleEnabled = !!(cfg && IsCfgEnabled(cfg, "ENABLE_PERF_DEBUG"));
        var trackingEnabled = !!(consoleEnabled || (cfg && IsCfgEnabled(cfg, "ENABLE_PERF_OVERLAY")));
        var detailed = !!(consoleEnabled && IsCfgEnabled(cfg, "ENABLE_PERF_DEBUG_DETAIL"));
        var wasConsoleEnabled = _perfConsoleActive;
        _perfTrackingActive = trackingEnabled;
        _perfConsoleActive = consoleEnabled;
        if (!trackingEnabled) {
            // The disabled path runs on every core tick. Clear diagnostic state
            // once per transition, not by allocating a new object at 5Hz.
            if (_perfDisabledStateClean && !State.perfEnabled) return;
            if (State.perfEnabled && wasConsoleEnabled) {
                QOL_INFO("Perf", "disabled");
            }
            State.perfEnabled = false;
            State.perfDetailed = false;
            State.perfStats = {};
            State.perfWindowStartMs = 0;
            State.perfNextFlushMs = 0;
            State.perfLoopCount = 0;
            State.perfCompassLoopCount = 0;
            State.perfSnapshotRing = null;
            _perfDisabledStateClean = true;
            return;
        }
        _perfDisabledStateClean = false;
        if (!State.perfEnabled) {
            var nowMs = PerfNowMs();
            State.perfEnabled = true;
            State.perfDetailed = detailed;
            State.perfSnapshotRing = null;
            ResetPerfWindow(nowMs);
            if (consoleEnabled) {
                QOL_INFO("Perf", "enabled (detail=" + (detailed ? "on" : "off") + ")");
            }
            return;
        }
        if (wasConsoleEnabled !== consoleEnabled) {
            State.perfDetailed = detailed;
            State.perfSnapshotRing = null;
            // Treat overlay and console profiling as separate measurement
            // windows. In particular, do not seed the console ring with
            // samples gathered before console diagnostics were enabled.
            State.perfStats = {};
            ResetPerfWindow(PerfNowMs());
            QOL_INFO("Perf", consoleEnabled
                ? ("enabled (detail=" + (detailed ? "on" : "off") + ")")
                : "disabled (overlay tracking remains)");
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
        if (!_perfConsoleActive) {
            ResetPerfWindow(nowMs);
            return;
        }

        var snapshotWindowMs = Math.max(1, nowMs - (State.perfWindowStartMs || nowMs));
        // Merge ring buffer snapshots + current live stats into a true 60s rolling window.
        var ring = State.perfSnapshotRing || [];
        var liveStats = State.perfStats || {};
        var liveKeys = Object.keys(liveStats);
        var liveTotal = 0;
        for (var lk = 0; lk < liveKeys.length; lk++) {
            var le = liveStats[liveKeys[lk]];
            if (le && le.count > 0) liveTotal += le.count;
        }
        $.Msg("[QOLLock][Perf][merge] ringSnaps=" + ring.length +
              " liveEntries=" + liveKeys.length + " liveSamples=" + liveTotal);
        var stats = _mergePerfSnapshots(ring, liveStats);
        // The oldest ring snapshot was captured at ring[0].timeMs, but the data
        // inside it was accumulated over the previous PERF_DEBUG_FLUSH_MS window.
        // So the actual data span starts at ring[0].timeMs - PERF_DEBUG_FLUSH_MS.
        var dataStartMs = ring.length > 0 ? ring[0].timeMs - PERF_DEBUG_FLUSH_MS : nowMs;
        var rollingWindowMs = Math.max(snapshotWindowMs, nowMs - dataStartMs);
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

        // Hz uses the rolling window (60s merged) for stable rates
        var loopHz = ((State.perfLoopCount * 1000) / snapshotWindowMs).toFixed(1);
        var compassHz = ((State.perfCompassLoopCount * 1000) / snapshotWindowMs).toFixed(1);
        var summary = parts.length > 0 ? parts.join(" | ") : "no samples";

        $.Msg(
            "[QOLLock][Perf] window=" + rollingWindowMs + "ms" +
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

// ── Surviving buildload utilities (ported from ql_feat_buildload.js) ──
// These were defined only in the old buildload file (now commented out in
// hud.xml Phase B). The save pipeline (ql_feat_buildsave.js) and buildbridge
// still call them, so they must survive the cut-over.

function ShouldRunBuildCategoryPayloadUiAction(nowMs, stateField, cooldownMs) {
    if (!stateField || stateField.length === 0) return true;
    var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
    var nextMs = Number(State[stateField]) || 0;
    if (now < nextMs) return false;
    var cd = Number(cooldownMs);
    if (!isFinite(cd) || cd < 0) cd = BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS;
    State[stateField] = now + cd;
    return true;
}

function ResetBuildCategoryPayloadProbeInitState() {
    State.buildCategoryPayloadHeroProbeInitAttempted = false;
    State.buildCategoryPayloadHeroProbeInitStage = "";
    State.buildCategoryPayloadHeroProbeInitNextMs = 0;
    State.buildCategoryPayloadHeroProbeInitRetries = 0;
    State.buildCategoryPayloadHeroProbeInitCreateAttempts = 0;
    State.buildCategoryPayloadHeroProbeInitCreateVerifyUntilMs = 0;
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

    // Resolve the Hud panel, cached. The parent-chain position of #Hud never
    // changes for the life of the context, but four separate call sites used to
    // re-run FindChildTraverse for it on every tick. GetCachedPanel validates via
    // IsValid() and sweepStalePanelCache() drops dead entries once a second, so
    // the cache is safe across the panel being torn down and rebuilt.
    function ResolveHudPanel(root) {
        var hud = GetCachedPanel("cachedHudPanel");
        if (hud) return hud;
        if (!root || !root.FindChildTraverse) return null;
        try { hud = root.FindChildTraverse(PANEL_ID_HUD); } catch (e) { hud = null; }
        if (hud) SetCachedPanel("cachedHudPanel", hud);
        return hud;
    }

    var _parseRevisionNumber = (typeof QOL_UTILS !== "undefined" && QOL_UTILS.ParseRevisionNumber) || function(v) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return 0;
        return Math.floor(n);
    };

    // ── Revision-gated config read ──
    //
    // The stored config is a ~9.2 KB JSON envelope (335 keys, all of them always
    // present because MergeConfig fills from defaults). GetAttributeString does
    // not hand back a view of the C++ buffer — it marshals a fresh JS string of
    // the full length. Reading it from both the root and the Hud panel therefore
    // allocated ~18.4 KB per tick, ~92 KB/s, ~220 MB over a 40-minute match, all
    // of it immediately garbage. Panorama's V8 runs on the UI thread, so those
    // scavenges land inside frames: exactly the shape of a 1%-low complaint
    // rather than an average-FPS one.
    //
    // Every writer of the config attribute pairs it with an increment of
    // USER_EDIT_REV_ATTR — ql_core.js WriteStorageConfigRawToUi, ql_settings.js
    // SaveAndSync, ql_arcade_games.js — on both the root and the Hud panel. So the
    // revision is a trustworthy 1-3 byte proxy for "did the config change", and
    // the 9.2 KB read only has to happen when it did.
    //
    // A wall-clock backstop still forces a full read periodically. If a future
    // writer ever forgets to bump the revision, that turns a permanent stale-config
    // bug into a bounded delay, which is the failure mode worth having.
    var _cfgCacheRevision = -1;
    var _cfgCacheRaw = "";
    var _cfgCacheFullReadMs = 0;
    const CONFIG_FULL_REREAD_INTERVAL_MS = 2000;

    // ReadStorageConfigRawFromUi — reads the serialized config from both the root and Hud
    // panel attributes, picking the version with the highest user-edit revision number.
    // Returns the SAME string instance while the revision is unchanged, which also makes
    // the callers' `raw === State.lastRawConfig` checks true pointer compares instead of
    // 9.2 KB memcmps.
    function ReadStorageConfigRawFromUi(root) {
        if (!root || !root.GetAttributeString) return "";

        var hud = ResolveHudPanel(root);

        // Cheap probe: two small attribute reads.
        var rootRev = 0;
        var hudRev = 0;
        try { rootRev = _parseRevisionNumber(root.GetAttributeString(USER_EDIT_REV_ATTR, "")); } catch (eR) { rootRev = 0; }
        if (hud && hud.GetAttributeString) {
            try { hudRev = _parseRevisionNumber(hud.GetAttributeString(USER_EDIT_REV_ATTR, "")); } catch (eH) { hudRev = 0; }
        }
        var revision = (hudRev > rootRev) ? hudRev : rootRev;

        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        var backstopDue = (nowMs - _cfgCacheFullReadMs) >= CONFIG_FULL_REREAD_INTERVAL_MS;
        if (revision === _cfgCacheRevision && _cfgCacheRaw !== "" && !backstopDue) {
            return _cfgCacheRaw;
        }

        var result = ReadStorageConfigRawUncached(root, hud, rootRev, hudRev);
        _cfgCacheRevision = revision;
        _cfgCacheRaw = result;
        _cfgCacheFullReadMs = nowMs;
        return result;
    }

    // The full read. Split out so the revision fast path above stays obvious, and
    // so a caller that genuinely needs current bytes can bypass the cache.
    function ReadStorageConfigRawUncached(root, hud, rootRev, hudRev) {
        var result = "";
        var source = "none";
        var rootLen = 0;
        var hudLen = 0;
        if (root && root.GetAttributeString) {
            var rootRaw = "";
            try { rootRaw = String(root.GetAttributeString(STORAGE_KEY, "") || ""); } catch (e0) { rootRaw = ""; }
            rootLen = rootRaw.length;

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
        var hud = ResolveHudPanel(root);
        var parseRev = _parseRevisionNumber;
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

        // Seed the read cache with what we just wrote. Without this the next
        // ReadStorageConfigRawFromUi would see a bumped revision and re-marshal
        // 9.2 KB it already has — and, worse, a write that loses a race with a
        // concurrent read would leave the cache holding pre-write bytes.
        _cfgCacheRevision = nextRevision;
        _cfgCacheRaw = nextRaw;
        _cfgCacheFullReadMs = Date.now ? Date.now() : (new Date()).getTime();

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

    // Compare-then-write. See ql_utils.js for why this is separate from SetStyleSafe.
    var SetStyleIfChanged = (QOL_UTILS_LOADED && QOL_UTILS.SetStyleIfChanged) ? QOL_UTILS.SetStyleIfChanged : function(panel, prop, value) {
        if (!panel || !panel.style || !prop) return false;
        try {
            if (panel.style[prop] === value) return false;
            panel.style[prop] = value;
            return true;
        } catch(e) { QOL_WARN("core", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
        return false;
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
        try { panel.style.uiScale = "100%"; } catch(e3) { QOL_WARN("core", "op failed: " + (e3 && e3.message ? e3.message : String(e3 || ""))); }
        try { panel.style.visibility = "visible"; } catch(e4) { QOL_WARN("core", "op failed: " + (e4 && e4.message ? e4.message : String(e4 || ""))); }
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

        var scaleText = String(scale) + "%";
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
        chatPanel.style.preTransformScale2d = "1.00, 1.00";
        chatPanel.style.uiScale = scaleText;

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

    // [DECOUPLED] Reload cooldown routines migrated to manifests/ql_reload_cooldown/manifest.js

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

    function IsConnectedToHideout(root) {
        // Game.GetMapInfo confirmed absent — use HUD panel classes for hideout detection.
        var hud = ResolveHudPanel(root);
        if (hud && (hud.BHasClass("connectedToHideout") || hud.BHasClass("InHideout"))) return true;
        return root.BHasClass("connectedToHideout") || root.BHasClass("InHideout");
    }

    function IsStartupLoaderInActiveMatchContext(root) {
        if (!root) return false;
        var hud = ResolveHudPanel(root);
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

    function EnsureTopBarPlayerPanelCacheState(root) {
        if (State.topbarPlayerPanelRoot && State.topbarPlayerPanelRoot !== root) {
            State.topbarPlayerPanels = null;
            State.topbarPlayerPanelLastScanMs = null;
            // Cleared with the panels: a stamped cooldown describes the old root's
            // tree, and holding it would freeze slots in a tree that was never
            // searched.
            State.topbarPlayerPanelMissUntilMs = null;
            // Deliberately NOT cleared with the panels: which slots the engine ever
            // creates is a property of the game, not of this root. Resetting it on a
            // root swap would re-arm the 30s absent-slot cooldown for every real
            // player and blank their nicknames and badges for half a minute.
            if (!State.topbarPlayerPanelEverResolved) State.topbarPlayerPanelEverResolved = new Array(SPM_MAX_PLAYERS);
        }
        State.topbarPlayerPanelRoot = root || null;
        if (!State.topbarPlayerPanels) State.topbarPlayerPanels = new Array(SPM_MAX_PLAYERS);
        if (!State.topbarPlayerPanelLastScanMs) State.topbarPlayerPanelLastScanMs = new Array(SPM_MAX_PLAYERS);
        if (!State.topbarPlayerPanelEverResolved) State.topbarPlayerPanelEverResolved = new Array(SPM_MAX_PLAYERS);
        if (!State.topbarPlayerPanelMissUntilMs) State.topbarPlayerPanelMissUntilMs = new Array(SPM_MAX_PLAYERS);
    }

    function AnyTopBarPlayerSlotEverResolved() {
        var flags = State.topbarPlayerPanelEverResolved;
        if (!flags) return false;
        for (var i = 0; i < flags.length; i++) {
            if (flags[i]) return true;
        }
        return false;
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
        // A slot that has NEVER ONCE resolved gets a much longer cooldown than one
        // whose panel merely went away.
        //
        // GROUND TRUTH from a captured live tree (2026-08-21): the engine numbers these
        // panels TopBarPlayer1..TopBarPlayer12 — twelve panels for a 6v6 match, and
        // there is NO TopBarPlayer0. Every consumer here loops from 0, so index 0 is a
        // lookup that cannot ever succeed, and a FindChildTraverse miss walks the entire
        // HUD: 31,411 panels in that capture. At the 1500ms refresh that is a full-tree
        // walk roughly every second and a half, forever, for a panel that does not
        // exist.
        //
        // The "ever resolved" flag is load-bearing and must not be simplified into
        // "is the cache empty right now". Panels die on every match transition and HUD
        // rebuild, so keying on an empty cache would apply the 30s freeze to REAL
        // players — their nicknames and rank badges would vanish for half a minute
        // after every reload. Only a slot that has never produced a panel in this
        // session is treated as absent.
        //
        // That flag was added with exactly this rule and then never read: the condition
        // was `!State.topbarPlayerPanels[index]`, which IS the simplification the
        // paragraph above forbids. Any transient miss on a real slot froze it for 30s,
        // and because this early return sits above the forceRefresh checks the freeze
        // could not be broken — RefreshSpmPlayerSlotCache passes forceRefresh=true and
        // was blocked anyway, which froze State.spm.playerPanels, the first lookup path
        // ql_nicknames tries.
        //
        // The cooldown is STAMPED at miss time rather than derived from lastScanMs on
        // read, because "is this slot absent" is only answerable in the moment. Before
        // the top bar inflates no slot has resolved, so every slot looks absent; deriving
        // the verdict on read means those early misses are re-judged as absent the
        // instant the first real slot resolves, and the other eleven stay frozen for
        // half a minute after the top bar appeared. Stamping records the verdict that
        // was true when the miss happened: early misses get the ordinary refresh
        // interval and are retried, and only a slot still missing once the top bar
        // demonstrably exists gets the long cooldown.
        //
        // Not hard-skipping index 0. Two player-slot id families in the capture
        // (TopBarPlayer, PlayerIntentsPlayer) are both 1-based, but other families in
        // the same tree are 0-based (ModCategory 0..2, ModIcon 0..7), so 1-based
        // numbering is an observation about one build, not a rule I can rely on. A long
        // negative cooldown removes essentially all of the cost while still finding the
        // panel within a minute if some mode really does create slot 0.
        var missUntil = Number(State.topbarPlayerPanelMissUntilMs[index]) || 0;
        if (missUntil > 0) {
            // Same time-source guard as above: a mismatched clock must not freeze a
            // slot for the rest of the session.
            if (now < missUntil && (missUntil - now) <= TOPBAR_PLAYER_PANEL_MISSING_RECHECK_MS) {
                return null;
            }
            State.topbarPlayerPanelMissUntilMs[index] = 0;
        }
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
        // Latch on first success. Never cleared for the life of the session — see the
        // absent-slot note above: this records "the engine does create this slot", so
        // a panel dying later must not re-arm the long cooldown.
        if (playerPanel) {
            State.topbarPlayerPanelEverResolved[index] = true;
            State.topbarPlayerPanelMissUntilMs[index] = 0;
        } else if (!State.topbarPlayerPanelEverResolved[index] &&
                   AnyTopBarPlayerSlotEverResolved()) {
            // Missed, has never resolved, and the top bar demonstrably exists because
            // another slot did resolve. That is the "the engine does not create this
            // slot" case, and it is the only one that earns the long freeze.
            State.topbarPlayerPanelMissUntilMs[index] = now + TOPBAR_PLAYER_PANEL_MISSING_RECHECK_MS;
        }
        return playerPanel || null;
    }

    var ULT_CD_MISSING_RECHECK_MS = 3000;
    var ULT_CD_DEBUG_SPIKE_MS = 2;
    var ULT_CD_DEBUG_THROTTLE_MS = 1000;
    var ultCdDebugLastLogMs = 0;

    // -------------------------------------------------------------------------
    // Ultimate Cooldown Overlay — panel lookup helpers
    // -------------------------------------------------------------------------
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
    var _breadPresetMatchDefaults = null;
    var _forcedConfigInput = null;
    var _forcedConfigOutput = null;

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
        if (!_breadPresetMatchDefaults) _breadPresetMatchDefaults = _BDC();
        var defaults = _breadPresetMatchDefaults;
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
        if (IsBreadPresetName(cfg.ACTIVE_PRESET_NAME)) return true;
        return DoesConfigMatchBreadPreset(cfg);
    }

    function ApplyForcedFeatureDisables(cfg) {
        if (!cfg) return cfg;
        // The same resolved config is consumed by the core, compass, and build
        // loops. Reuse the forced result instead of cloning and re-matching the
        // full preset on every consumer tick.
        if (cfg === _forcedConfigInput || cfg === _forcedConfigOutput) {
            return _forcedConfigOutput || cfg;
        }
        var breadActive = IsBreadPresetActive(cfg);
        var normalizeBreadName = breadActive && cfg.ACTIVE_PRESET_NAME !== BREAD_PRESET_NAME;
        var disableMinSouls = cfg.ENABLE_MIN_SOULS !== 0;
        var disableUnspent = !breadActive && cfg.ENABLE_UNSPENT_SOULS !== 0;
        if (!normalizeBreadName && !disableMinSouls && !disableUnspent) {
            _forcedConfigInput = cfg;
            _forcedConfigOutput = cfg;
            return cfg;
        }

        // Clone only when at least one forced value actually differs.
        var result = Object.assign({}, cfg);
        result.ENABLE_MIN_SOULS = 0;
        if (breadActive) result.ACTIVE_PRESET_NAME = BREAD_PRESET_NAME;
        else result.ENABLE_UNSPENT_SOULS = 0;
        _forcedConfigInput = cfg;
        _forcedConfigOutput = result;
        return result;
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
            if (shape.style.preTransformScale2d !== "1.00, 1.00") shape.style.preTransformScale2d = "1.00, 1.00";
            var shapeUiScale = Math.round(Number(scaleText) * 100) + "%";
            if (shape.style.uiScale !== shapeUiScale) shape.style.uiScale = shapeUiScale;
            SetPanelOpacitySafe(shape, opacityText, 1.0);
        }
        var hintContainers = State.hintContainerCache || [];
        for (var hc = 0; hc < hintContainers.length; hc++) {
            var hint = hintContainers[hc];
            if (!hint) continue;
            if (hint.style.preTransformScale2d !== "1.00, 1.00") hint.style.preTransformScale2d = "1.00, 1.00";
            var hintUiScale = Math.round(Number(hintScaleText || "1.000") * 100) + "%";
            if (hint.style.uiScale !== hintUiScale) hint.style.uiScale = hintUiScale;
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
    // Settings loader overlay cards extracted to core/ql_settings_loader.js

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
                QOL.dispatchCitadelConCommand("citadel_open_hero_sheet");
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
            opened = QOL.dispatchCitadelConCommand("citadel_open_hero_sheet");
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
                QOL.dispatchCitadelConCommand("citadel_open_hero_sheet");
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
            QOL.dispatchCitadelConCommand("citadel_open_hero_sheet");
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
            var roots = [root, GetUIRoot()];
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
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        var field = stateField ? String(stateField) : "";
        var cd = Number(cooldownMs);
        if (!isFinite(cd) || cd < 0) cd = BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS;
        if (field.length > 0 && !QOL.shouldRunBuildCategoryPayloadUiAction(now, field, cd)) {
            return false;
        }
        // Direct engine call (verified JS binding): switch shop mods to Favorites tab.
        // Requires the shop to already be open.
        if (IsHudClassActive(root, "gShopOpen")) {
            try {
                if (typeof CitadelShopModsActivate === "function" && typeof EItemSlotType_Favorites !== "undefined") {
                    CitadelShopModsActivate(EItemSlotType_Favorites);
                    return true;
                }
            } catch (eDirect) {
                QOL_WARN("core", "CitadelShopModsActivate failed: " + (eDirect && eDirect.message ? eDirect.message : String(eDirect || "")));
            }
        }
        // Fallback: activate the Favorites nav panel directly.
        var favoritesNav = FindShopFavoritesNavButton(root);
        if (!favoritesNav || !IsPanelValid(favoritesNav)) {
            SetCachedPanel("shopFavoritesNavButton", null);
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
        // CitadelOpenUpgradeShop is a registered Panorama JS action (arg count 0),
        // verified in client.dll (registered by FUN_1801adc40 via FUN_181ee3c90).
        // Try it first; fall back to the open_item_shop console command (the B-key
        // input-action path, CitadelConCommand -> RunConCommand -> Engine ClientCmd).
        // CitadelEnterUpgradeShop / CitadelToggleUpgradeShop do not exist in any
        // decompiled DLL (0 occurrences in client.dll, server.dll).
        try {
            if (typeof CitadelOpenUpgradeShop === "function") {
                CitadelOpenUpgradeShop();
                opened = true;
            }
        } catch (e0) { QOL_WARN("core", "CitadelOpenUpgradeShop failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        if (!opened) {
            opened = QOL.dispatchCitadelConCommand("open_item_shop");
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
            opened = QOL.dispatchCitadelConCommand("citadel_open_hero_sheet");
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

    function SetSettingsLoaderStepState(key, status, detail) {
        if (QOL.setSettingsLoaderStepState) return QOL.setSettingsLoaderStepState(key, status, detail);
    }
    function SettingsLoaderDebugLog(msg) {
        if (QOL.settingsLoaderDebugLog) return QOL.settingsLoaderDebugLog(msg);
    }
    function SetSettingsLoaderDebugOverlayLine(line) {
        if (QOL.setSettingsLoaderDebugOverlayLine) return QOL.setSettingsLoaderDebugOverlayLine(line);
    }
    function SettingsLoaderTraceLogThrottled(sig, msg, nowMs) {
        if (QOL.settingsLoaderTraceLogThrottled) return QOL.settingsLoaderTraceLogThrottled(sig, msg, nowMs);
    }

    function EnterStartupCorruptRepairPrompt(root, nowMs, reason) {
        var why = reason ? String(reason) : "unknown";
        var now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
        SetStartupCorruptRepairPending(root, true);
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
    // One line per DISTINCT resolution, not one per lookup. The confirm stage
    // re-reads every signature slot on every poll, so an unthrottled log emits
    // the same line ~4x/s for as long as the stage runs — 19 identical
    // "ENTANGLING BOLA" lines in the 2026-09-05 report, which is what pushed the
    // stage transitions that actually explained the failure out of the window.
    // Keyed by resolution rather than by name so a slot whose ability CHANGES
    // (the whole point of the confirm) still logs.
    var _sigLocaleDiagSeen = {};

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
                var diagKey = String(clean) + "|" + String(localeAbility);
                if (!_sigLocaleDiagSeen[diagKey]) {
                    _sigLocaleDiagSeen[diagKey] = true;
                    $.Msg("[QOLLock][LANG] NormalizeStorageHeroSignatureAbilityName: locale lookup resolved \"" + String(clean) + "\" → \"" + String(localeAbility) + "\"");
                }
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

    // [DECOUPLED] EnsureStorageBuildInitialized removed — superseded by manifests/ql_build_storage

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

    // [DECOUPLED] Legacy build save/clear/delete pipeline removed (~2400 lines).
    // Build storage is now fully owned by manifests/ql_build_storage.
    // Preserved shared UI helpers below:

    function IsPanelVisibleMaybe(panel) {
        if (!panel || !IsPanelValid(panel)) return false;
        try {
            if (panel.visible !== undefined && panel.visible !== null) {
                return panel.visible === true;
            }
        } catch (e0) { QOL_WARN("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
        return true;
    }

    function FindBrowseBuildsCancelButton(root) {
        if (!root || !root.FindChildTraverse) return { panel: null };
        var popup = root.FindChildTraverse("PopupBuildBrowser") || root.FindChildTraverse("BrowseBuilds");
        if (!popup) {
            var uiRoot = GetUIRoot();
            if (uiRoot && uiRoot.FindChildTraverse) {
                popup = uiRoot.FindChildTraverse("PopupBuildBrowser") || uiRoot.FindChildTraverse("BrowseBuilds");
            }
        }
        if (!popup) return { panel: null };
        var btn = popup.FindChildTraverse ? (popup.FindChildTraverse("Button1") || popup.FindChildTraverse("CancelButton")) : null;
        if (btn && IsPanelValid(btn)) return { panel: btn };
        var stack = [popup];
        var scanned = 0;
        while (stack.length > 0 && scanned < 100) {
            var p = stack.pop();
            if (!p) continue;
            scanned++;
            if (p.BHasClass && p.BHasClass("SecondaryButton") && p.BHasClass("outline")) {
                return { panel: p };
            }
            var count = p.GetChildCount ? p.GetChildCount() : 0;
            for (var i = 0; i < count; i++) {
                var ch = p.GetChild(i);
                if (ch) stack.push(ch);
            }
        }
        return { panel: null };
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

    function TryOpenBuildBrowserPopup(root) {
        if (IsBrowseBuildsPopupOpen(root)) return true;
        try {
            if (typeof CitadelOpenBuildBrowser === "function") {
                CitadelOpenBuildBrowser(1);
            }
        } catch(e) {}
        return IsBrowseBuildsPopupOpen(root);
    }

    function ReadPanelTextDeepMaybe(panel, maxDepth) {
        if (!panel) return "";
        var direct = ReadPanelTextMaybe(panel);
        if (direct && direct.length > 0) return direct;
        var depth = Number(maxDepth);
        if (!isFinite(depth) || depth <= 0) depth = 4;
        var queue = [{ p: panel, d: 0 }];
        var scanned = 0;
        while (queue.length > 0 && scanned < 256) {
            var item = queue.shift();
            if (!item || !item.p) continue;
            scanned++;
            var t = ReadPanelTextMaybe(item.p);
            if (t && t.length > 0) return t;
            if (item.d >= depth) continue;
            var childCount = 0;
            try { childCount = item.p.GetChildCount ? item.p.GetChildCount() : 0; } catch (e0) { childCount = 0; }
            for (var ci = 0; ci < childCount; ci++) {
                var ch = null;
                try { ch = item.p.GetChild(ci); } catch (e1) { ch = null; }
                if (ch) queue.push({ p: ch, d: item.d + 1 });
            }
        }
        return "";
    }

    function FindHeroBuildListPanel(root) {
        if (!root || !root.FindChildTraverse) return null;
        var ids = ["HeroBuildList", "BuildList", "CitadelHeroBuildList"];
        for (var i = 0; i < ids.length; i++) {
            var p = null;
            try { p = root.FindChildTraverse(ids[i]); } catch (e) { p = null; }
            if (p && IsPanelValid(p)) return p;
        }
        return null;
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

    function ResolveBuildSaveStorageHeroSignal(root) {
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

        // Deadlock's August 2026 HUD moved Unsecured out of the old
        // death-gold container.  Prefer the dedicated live counter; the
        // fallback below is retained for older builds.
        var modernUnsecured = root.FindChildTraverse ? root.FindChildTraverse("HudUnsecuredLabel") : null;
        if (IsPanelValid(modernUnsecured)) return modernUnsecured;

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
        QOL_DEBUG(
            "combat_indicator",
            "sig=" + sig +
            " enabled=" + (enabled ? "1" : "0") +
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
            " sampleColor=" + (sampleValueColor || "-")
        );
    }
    // Apply the combat-indicator classes to every panel the CSS keys off.
    //
    // Called unconditionally from ApplyCoreLoopRootClassesAndState, i.e. every tick
    // whether or not the feature is on. The four lookups below used to be raw
    // FindChildTraverse calls from the HUD root — 20 root traversals a second, for
    // the whole match, to re-find four panels that live for the whole match. The two
    // above them were already cached, which is what made the omission easy to miss.
    //
    // ResolveCachedPanel does the GetCachedPanel/FindChildTraverse/SetCachedPanel
    // dance and re-validates on read, so a panel that is torn down and rebuilt is
    // picked up again on the next tick.
    //
    // The class writes themselves are already correctly guarded: SetPanelClassIfChanged
    // compares with BHasClass first, so a steady state performs no engine writes at
    // all. That matters here because combat_indicator_enabled carries 56 CSS rules
    // and a genuine flip is not cheap.
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
        pushPanel(GetCachedPanel("gameplayHud"));
        pushPanel(ResolveCachedPanel(root, "healthContainer", PANEL_ID_HEALTH_CONTAINER));
        pushPanel(ResolveCachedPanel(root, "combatIndicatorHealthBarContent", "HealthBarContent"));
        pushPanel(ResolveCachedPanel(root, "combatIndicatorHealthRegenAndTotal", "HealthRegenAndTotal"));
        pushPanel(ResolveCachedPanel(root, "combatIndicatorHealthBars", "hud_health_bars"));
        for (var p = 0; p < panels.length; p++) {
            SetPanelClassIfChanged(panels[p], "combat_indicator_enabled", enabled);
            SetPanelClassIfChanged(panels[p], "combat_indicator_active", active);
        }
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

    // [DECOUPLED] Item mirror and Compass routines migrated to manifests/ql_item_mirror and manifests/ql_compass

    function IsManifestFeatureEnabled(featureId) {
        try {
            return !!(QOL.core && QOL.core.FeatureRegistry &&
                QOL.core.FeatureRegistry.isEnabled(featureId));
        } catch(eManifestEnabled) { return false; }
    }

    // [DECOUPLED] compassLoop removed — manifests now own their scheduled intervals

    // [DECOUPLED] buildRequestLoop removed — superseded by manifests/ql_build_storage


    if (typeof QOL !== "undefined" && QOL) {
        QOL.updateReloadCircleExceptionState = UpdateReloadCircleExceptionState;
        QOL.updateChatRuntime = UpdateChatRuntime;
        QOL.hasNonDefaultChatRuntimeConfig = HasNonDefaultChatRuntimeConfig;
        QOL.updateShowBuildIdRuntime = UpdateShowBuildIdRuntime;
        QOL.updateDamageReportOffsets = UpdateDamageReportOffsets;
        QOL.needsDamageReportOffsetWork = NeedsDamageReportOffsetWork;
        QOL.updateUrnTrackerOverlay = UpdateUrnTrackerOverlay;
        QOL.needsUrnTrackerRuntimeWork = NeedsUrnTrackerRuntimeWork;
    }

    function ApplyCoreLoopRootClassesAndState(root, cfg, nowMsLoop, hideoutConnected, hasConfigSource) {
        if (typeof QOL !== "undefined" && QOL.core && QOL.core.hud && typeof QOL.core.hud.applyRootClasses === "function") {
            return QOL.core.hud.applyRootClasses(root, cfg, nowMsLoop, hideoutConnected, hasConfigSource);
        }
        return false;
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
        $.Schedule(offsetSec, function() {
            for (var i = 0; i < features.length; i++) {
                var fn = features[i];
                if (!fn) continue;
                try {
                    fn(_s);
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
            healthbarRuntimeActive: false,
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
        if (State.passiveCooldownModeApplied !== featureState.passiveCooldownMode || State.oldItemCooldownRuntimeWasActive) return true;
        if (featureState.passiveCooldownMode !== "default" && !GetCachedPanel("passiveHud")) return true;
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

        // P1: skip when new manifests are active to prevent dual execution
        var _rejuvManifestActive = false;
        try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _rejuvManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_rejuv_hud") || QOL.core.FeatureRegistry.isEnabled("ql_minimap_timers"); } } catch(e) {}
        if (!_rejuvManifestActive) {
            gates.rejuvTimers = gates.rejuvTimersActive || (!gates.rejuvTimersActive && !State.rejuvWasDisabled && ShouldRunStaggeredDisableCleanup(corePhase, CORE_PHASE_REJUV_NICKNAMES));
        }
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
// P1: skip when new manifest is active to prevent dual execution
        var _unsecuredSoulsManifestActive = false;
        try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _unsecuredSoulsManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_unsecured_souls_timer"); } } catch(e) {}
        if (!_unsecuredSoulsManifestActive) { gates.unsecuredSouls = (gates.unsecuredSoulsActive || State.unsecuredSouls.displayMode !== "") && ((!CORE_SCHEDULER_V2_ENABLED) || (corePhase === CORE_PHASE_UNSECURED)); }
        gates.combatStatus = gates.combatStatusActive || gates.combatIndicatorActive || State.combatStatus.displayMode !== "";
        gates.signatureFlash = gates.signatureFlashActive || !!State.signatureCooldownFlashWasEnabled;
        var _legacyManifestActive = false;
        try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _legacyManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_legacy_audio_passive"); } } catch(e) {}
        if (!_legacyManifestActive) { gates.legacyAudioPassive = gates.legacyAudioPassiveActive; }
        gates.imagesInChat = gates.imagesInChatActive;
        gates.showRank = gates.showRankActive;
        var _recentPurchasesManifestActive = false;
        try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _recentPurchasesManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_recent_purchases"); } } catch(e) {}
        if (!_recentPurchasesManifestActive) { gates.recentPurchases = gates.recentPurchasesActive || State.recentPurchasesWasEnabled; }
        gates.gameplayMouseCursor = NeedsGameplayMouseCursorRuntimeWork(root, hideoutConnected);
// P1: skip when new manifest is active to prevent dual execution
        var _betterUnsecuredHudManifestActive = false;
        try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _betterUnsecuredHudManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_better_unsecured_hud"); } } catch(e) {}
        if (!_betterUnsecuredHudManifestActive) {         gates.betterUnsecuredHud = gates.betterUnsecuredHudActive || !!(
            State.unsecuredSouls.hudStyleSig ||
            GetCachedPanel("betterUnsecuredOverlay") ||
            GetCachedPanel("unsecuredSoulsHudContainer")
        ); }
// P1: skip when new manifest is active to prevent dual execution
        var _colorWarningsManifestActive = false;
        try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _colorWarningsManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_color_warnings"); } } catch(e) {}
        if (!_colorWarningsManifestActive) {         gates.colorWarning = gates.colorWarningActive; }
        gates.enemyColorWarning = NeedsEnemyColorWarningRuntimeWork(cfg);
        gates.allyColorWarning = NeedsAllyColorWarningRuntimeWork(cfg);
// P1: skip when new manifest is active to prevent dual execution
        var _ammoManifestActive = false;
        try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _ammoManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_ammo"); } } catch(e) {}
        if (!_ammoManifestActive) {         gates.ammo = gates.ammoActive || !!(State.ammoPanelStyleSig && String(State.ammoPanelStyleSig).length > 0); }
        var _topBarManifestActive = false;
        try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _topBarManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_topbar"); } } catch(e) {}
        if (!_topBarManifestActive) {        gates.topBarRuntime = NeedsTopBarRuntimeWork(cfg); }
        var _bottomBarManifestActive = false;
        try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _bottomBarManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_bottom_bar"); } } catch(e) {}
        if (!_bottomBarManifestActive) {         gates.bottomBarRuntime = NeedsBottomBarRuntimeWork(cfg); }
        var _itemsManifestActive = false;
        try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _itemsManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_items"); } } catch(e) {}
        if (!_itemsManifestActive) {         gates.itemsRuntime = NeedsItemsRuntimeWork(cfg); }
        var _soulsManifestActive = false;
        try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _soulsManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_souls"); } } catch(e) {}
        if (!_soulsManifestActive) {         gates.soulsRuntime = NeedsSoulsRuntimeWork(cfg); }
        var _heroShopManifestActive = false;
        try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _heroShopManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_heroshop"); } } catch(e) {}
        if (!_heroShopManifestActive) {      gates.heroShop = NeedsHeroShopRuntimeWork(cfg); }
        gates.targetShapes = gates.targetShapesActive || !!(
            State.targetShapeHadNonDefaultRuntime ||
            State.targetShapeStyleSig ||
            State.nextTargetShapeRefreshMs ||
            (State.targetShapesCache && State.targetShapesCache.length > 0) ||
            (State.hintContainerCache && State.hintContainerCache.length > 0)
        );
        var _damageImpactManifestActive = false;
        try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _damageImpactManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_damage_impact"); } } catch(e) {}
        if (!_damageImpactManifestActive) {  gates.damageImpactRuntime = NeedsDamageImpactRuntimeWork(cfg); }
        var _staminaManifestActive = false;
        try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _staminaManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_stamina"); } } catch(e) {}
        if (!_staminaManifestActive) {         gates.staminaChargeColorRuntime = NeedsStaminaChargeColorRuntimeWork(cfg); }
        gates.damageNumbers = gates.damageNumbersActive ||
            !!(State.lastIndicatorConfigSig && State.lastIndicatorConfigSig !== DAMAGE_NUMBERS_DEFAULT_RUNTIME_SIG) ||
            State.accountPresetTestActive;
        var _minimapManifestActive = false;
        try { if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry) { _minimapManifestActive = QOL.core.FeatureRegistry.isEnabled("ql_minimap_runtime"); } } catch(e) {}
        if (!_minimapManifestActive) {
            var _mmFeat = QOL_FEATURE_REGISTRY["minimapRuntime"];
            gates.minimapRuntime = _mmFeat && _mmFeat.gate ? _mmFeat.gate(cfg, raw) : false;
        }
        var _coreRootActive = (State.rootClassCache && State.rootClassCache.panel !== root) || State.coreRootGateSig !== gates.sig || NeedsCoreRootDynamicRuntimeWorkFromState(gates.featureState);
        gates.coreRoot = _coreRootActive;


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
        // P1: skip old loader when ql_build_payload manifest is active (dual-dispatch guard).
        // Also guard the fall-through: if the old load file is commented out (Phase B),
        // QOL.shouldRunBuildCategoryPayloadOverride is undefined and calling it would
        // throw every tick, freezing all features.
        try {
            if (typeof QOL !== "undefined" && QOL.core && QOL.core.FeatureRegistry &&
                QOL.core.FeatureRegistry.isEnabled("ql_build_payload")) {
                return cfg;
            }
        } catch(e) { /* fall through to legacy loader on guard failure */ }
        if (typeof QOL.shouldRunBuildCategoryPayloadOverride === "function" &&
            QOL.shouldRunBuildCategoryPayloadOverride(root, nowMs)) {
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
            !State.saveSettingsLoaderSessionActive && !State.saveSettingsLoaderSessionCompleted) {
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
    var _FEATURE_RUNNERS = {};
    function _getRegistryKeys() {
        if (!_REGISTRY_KEYS) _REGISTRY_KEYS = Object.keys(QOL_FEATURE_REGISTRY).sort();
        return _REGISTRY_KEYS;
    }

    function _getFeatureRunner(featureName, featureEntry, perfLabel) {
        var cached = _FEATURE_RUNNERS[featureName];
        if (cached) return cached;
        var currentSnapshot = null;
        function executeCurrentSnapshot() {
            var snapshot = currentSnapshot;
            var perfStartMs = PerfStart();
            featureEntry.update(snapshot.root, snapshot.cfg, snapshot.nowMs, State, snapshot.hideoutConnected, snapshot.raw);
            if (featureEntry.postUpdate) featureEntry.postUpdate(snapshot, State);
            PerfEnd(perfLabel, perfStartMs);
        }
        cached = function(snapshot) {
            currentSnapshot = snapshot;
            try { ExecuteFeature(featureName, executeCurrentSnapshot); }
            finally { currentSnapshot = null; }
        };
        _FEATURE_RUNNERS[featureName] = cached;
        return cached;
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
            buckets[bucketIndex].push(_getFeatureRunner(featureName, featureEntry, featureEntry.perfLabel));
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
            // Deferred buckets all consume the same immutable per-tick data.
            // Clone once, rather than once for every non-empty bucket.
            var scheduledSnapshot = Object.assign({}, loopSnapshot);
            if (buckets[0].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_0_MS, buckets[0], scheduledSnapshot);
            if (buckets[1].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_1_MS, buckets[1], scheduledSnapshot);
            if (buckets[2].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_2_MS, buckets[2], scheduledSnapshot);
            if (buckets[3].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_3_MS, buckets[3], scheduledSnapshot);
            if (buckets[4].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_4_MS, buckets[4], scheduledSnapshot);
            if (buckets[5].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_5_MS, buckets[5], scheduledSnapshot);
            if (buckets[6].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_6_MS, buckets[6], scheduledSnapshot);
            if (buckets[7].length > 0) _scheduleFeatureBucket(FEATURE_OFFSET_BUCKET_7_MS, buckets[7], scheduledSnapshot);
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
            State.saveSettingsLoaderSessionActive || State.saveSettingsLoaderSessionCompleted) {
            if (ShouldUpdateStartupLoaderOverlay() && QOL.updateSettingsLoaderOverlay) QOL.updateSettingsLoaderOverlay(root, nowMs);
            if (_settingsLoaderShowing && ShouldUpdateSaveLoaderOverlay()) {
                if (QOL.traceLoaderOverlay) QOL.traceLoaderOverlay("suppressed-by-load", GetCachedPanel("settingsLoaderOverlay"), true);
            }
            if (!_settingsLoaderShowing && ShouldUpdateSaveLoaderOverlay() && QOL.updateSaveSettingsLoaderOverlay) QOL.updateSaveSettingsLoaderOverlay(root, nowMs);
        }
    }

    function syncDiagnosticState(root, nowMs) {
        try {
            if (typeof QOL_FEATURE_REGISTRY === "undefined") return;
            var diagRoot = State.rootPanel || root;
            // Cached: the throttle below is 5s, but the force-sync token has to be
            // polled every tick for the Settings-side 6s timeout to work — so this
            // lookup ran 5x/sec while 24 of every 25 results were discarded.
            var diagHud = ResolveHudPanel(diagRoot);
            // ── Force-sync: Settings context writes a token to QOL_DiagRequest when it
            //     needs an immediate diagnostic snapshot (e.g. after a preset change).
            //     Echo the token in the response so the caller can match it. ──
            var forceSync = false;
            var forceToken = "";
            if (diagHud && diagHud.GetAttributeString) {
                forceToken = diagHud.GetAttributeString("QOL_DiagRequest", "");
                if (forceToken && forceToken !== State._lastDiagForceToken) {
                    State._lastDiagForceToken = forceToken;
                    // ── Command dispatch: if forceToken starts with "mt_", trigger manifest
                    //     test runner. This is a COMMAND path (not a diagnostic read path) —
                    //     it returns early to avoid being tangled with diag snapshot logic. ──
                    if (forceToken.indexOf("mt_") === 0 || forceToken.indexOf("fs_") === 0) {
                        if (QOL && QOL.core && QOL.core.ManifestTests) {
                            try { QOL.core.ManifestTests.runAll({ token: forceToken, onComplete: function() { State._diagWriteNextMs = 0; } }); } catch(_mtErr) { QOL_WARN("core", "manifest test run failed: " + (_mtErr && _mtErr.message ? _mtErr.message : String(_mtErr || ""))); }
                        }
                        // Fall through to write diagnostic now — echos token so Settings
                        // poller sees request was received. onComplete resets throttle so
                        // results are written on the next cycle after tests finish.
                    }
                    // ── "dt_" — summarise the real panel tree into the console log.
                    //     Developer tool, not part of any feature. The log it produces is
                    //     converted by scripts/import_tree_dump.js into a captured profile
                    //     for the headless profiler, so cost numbers stop depending on our
                    //     model of what the engine builds.
                    //
                    //     Summary, not a full per-panel dump: a live match HUD measured
                    //     37,524 panels, and a full dump of that overran the game's
                    //     rolling console log — 2,152 lines survived out of 37,524. The
                    //     aggregate is a few hundred lines and carries what the profiler
                    //     needs (tree size, depth profile, id distribution). QOL.dumpTree
                    //     is still available for a single subtree. ──
                    if (forceToken.indexOf("dt_") === 0) {
                        if (QOL && typeof QOL.dumpTreeSummary === "function") {
                            try { QOL.dumpTreeSummary(diagHud || diagRoot); }
                            catch(_dtErr) { QOL_WARN("core", "tree summary failed: " + (_dtErr && _dtErr.message ? _dtErr.message : String(_dtErr || ""))); }
                        } else {
                            QOL_WARN("core", "tree summary requested but QOL.dumpTreeSummary is unavailable");
                        }
                    }
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
            // P2: include manifest test results in diagnostic snapshot
            if (QOL && QOL.core && QOL.core.ManifestTests) {
                var tr = QOL.core.ManifestTests.getResults();
                if (tr) {
                    diag.testResults = {
                        summary: tr.summary,
                        results: tr.results,
                        timestamp: tr.timestamp,
                        token: tr.token
                    };
                }
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
        if (IsManifestFeatureEnabled("ql_target_shapes")) {
            State.unitTargetBootstrapDone = true;
            return;
        }
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
        ["ensureMinimapOverlayAnchor", function() { return EnsureMinimapOverlayAnchor; }],
        ["estimateUnsecuredSoulsEtaFallbackSec", function() { return EstimateUnsecuredSoulsEtaFallbackSec; }],
        ["findChatMessageLabel", function() { return FindChatMessageLabel; }],
        ["findImagesInChatMessageCacheEntry", function() { return FindImagesInChatMessageCacheEntry; }],
        ["findUnsecuredSoulsSource", function() { return FindUnsecuredSoulsSource; }],
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
        ["isStreetBrawlModeActive", function() { return IsStreetBrawlModeActive; }],
        ["normalizeHudOffsetNumber", function() { return NormalizeHudOffsetNumber; }],
        ["normalizeHudScaleNumber", function() { return NormalizeHudScaleNumber; }],
        ["normalizePaletteColorIndex", function() { return NormalizePaletteColorIndex; }],
        ["normalizeVoiceTypeValue", function() { return (typeof QOL !== "undefined" && QOL.normalizeVoiceTypeValue) || (function(v) { var asInt = Math.round(Number(v)); if (asInt === 4 || asInt === 0 || asInt === 5 || asInt === 6 || asInt === 7 || asInt === 8) return asInt; return 0; }); }],
        ["normalizeVoiceVolumeValue", function() { return (typeof QOL !== "undefined" && QOL.normalizeVoiceVolumeValue) || (function(v) { var asInt = Math.round(Number(v)); if (!isFinite(asInt)) asInt = 100; if (asInt < 0) asInt = 0; if (asInt > 100) asInt = 100; return asInt; }); }],
        ["parseClockSeconds", function() { return ParseClockSeconds; }],
        ["parseUnsecuredSoulsValue", function() { return ParseUnsecuredSoulsValue; }],
        ["perfEnd", function() { return PerfEnd; }],
        ["perfNowMs", function() { return PerfNowMs; }],
        ["perfStart", function() { return PerfStart; }],
        ["pruneImagesInChatMessageCache", function() { return PruneImagesInChatMessageCache; }],
        ["readKeyboardOverlayWashColorIndex", function() { return ReadKeyboardOverlayWashColorIndex; }],
        ["resetKeyboardOverlayCaches", function() { return ResetKeyboardOverlayCaches; }],
        ["resetUnsecuredSoulsTracking", function() { return ResetUnsecuredSoulsTracking; }],
        ["resolveCachedPanel", function() { return ResolveCachedPanel; }],
        ["resolvePassiveCooldownMode", function() { return ResolvePassiveCooldownMode; }],

        ["resolveWashColorFromPalette", function() { return ResolveWashColorFromPalette; }],
        ["setCachedPanel", function() { return SetCachedPanel; }],
        ["setPanelClassCached", function() { return SetPanelClassCached; }],
        ["activatePanelSafe", function() { return ActivatePanelSafe; }],
        ["findAncestorWithClass", function() { return (typeof QOL_UTILS !== "undefined") ? QOL_UTILS.FindAncestorWithClass : function() { return null; }; }],
        ["readPanelIdTextMaybe", function() { return ReadPanelIdTextMaybe; }],
        ["readPanelTextDeepMaybe", function() { return ReadPanelTextDeepMaybe; }],
        ["panelHasClassToken", function() { return PanelHasClassToken; }],
        ["panelIdGoldApContainer", function() { return PANEL_ID_GOLD_AP_CONTAINER; }],
        ["panelIdTopBar", function() { return PANEL_ID_TOP_BAR; }],
        ["readMinimapIconColorIndex", function() { return ReadMinimapIconColorIndex; }],
        ["setPanelClassIfChanged", function() { return SetPanelClassIfChanged; }],
        ["setWashColorSafe", function() { return SetWashColorSafe; }],
        ["state", function() { return State; }],
        ["extractBuildCategoryPayloadToken", function() { return ExtractBuildCategoryPayloadToken; }],
        ["getAccountIdForBuildCategoryPayload", function() { return (typeof QOL !== "undefined" && QOL.getAccountIdForBuildCategoryPayload) || (function() { return ""; }); }],
        ["confirmStorageHeroSignatureAbilities", function() { return ConfirmStorageHeroSignatureAbilities; }],
        // The pure read underneath the confirm. Exported so a caller that only
        // wants to know WHICH hero the ability HUD is showing can ask without
        // going through ConfirmStorageHeroSignatureAbilities, which mutates the
        // consecutive-hit counters that the confirm stage depends on.
        ["readStorageHeroSignatureSlots", function() { return ReadStorageHeroSignatureSlots; }],
        ["resolvePlayableHeroAlias", function() { return ResolvePlayableHeroAlias; }],
        ["resolveBuildSaveStorageHeroSignal", function() { return ResolveBuildSaveStorageHeroSignal; }],
        ["tryReadBuildSaveStorageHeroFromSettings", function() { return function() { return null; }; }],
        ["extractHeroTokenFromText", function() { return ExtractHeroTokenFromText; }],
        ["finalizeSaveSettingsLoaderSession", function() { return QOL.finalizeSaveSettingsLoaderSession; }],
        ["beginSaveSettingsLoaderSession", function() { return QOL.beginSaveSettingsLoaderSession; }],
        ["setSaveSettingsLoaderStepState", function() { return QOL.setSaveSettingsLoaderStepState; }],
        ["beginSettingsLoaderSession", function() { return QOL.beginSettingsLoaderSession; }],
        ["finalizeSettingsLoaderSession", function() { return QOL.finalizeSettingsLoaderSession; }],
        ["buildDefaultConfig", function() { return (typeof QOL !== "undefined" && QOL.buildDefaultConfig) || _BDC; }],
        ["heroReturnDebugLog", function() { return HeroReturnDebugLog; }],
        ["settingsLoaderDebugLogThrottled", function() { return QOL.settingsLoaderDebugLogThrottled; }],
        ["setSettingsLoaderDebugOverlayLine", function() { return QOL.setSettingsLoaderDebugOverlayLine; }],
        ["buildDefaultPayloadToken", function() { return BuildDefaultPayloadToken; }],
        ["buildPayloadFromBase64Url", function() { return BuildPayloadFromBase64Url; }],
        ["deserializeBuildPayloadCompact", function() { return DeserializeBuildPayloadCompact; }],
        ["ensureStorageHeroFavoritesHeaderVisible", function() { return EnsureStorageHeroFavoritesHeaderVisible; }],
        ["getLoaderBaseDefaultHeroId", function() { return GetLoaderBaseDefaultHeroId; }],
        ["isBrowseBuildsPopupOpen", function() { return IsBrowseBuildsPopupOpen; }],
        ["tryOpenBuildBrowserPopup", function() { return TryOpenBuildBrowserPopup; }],
        ["shouldRunBuildCategoryPayloadUiAction", function() { return ShouldRunBuildCategoryPayloadUiAction; }],
        // Surviving stubs: called from FinalizeSettingsLoaderSession skip/reset paths.
        // The manifest never sets old-loader probe State fields, so probeWasActive is
        // always false — these are only reached on the else/cleanup branches.
        ["completeBuildCategoryPayloadHeroProbe", function() { return function(a,m,r,d,o) { /* manifest-only: probe state never active */ }; }],
        ["resetBuildCategoryPayloadHeroProbeState", function() { return function() {
            State.buildCategoryPayloadHeroProbeStage = "";
            State.buildCategoryPayloadHeroProbeNextMs = 0;
            State.buildCategoryPayloadHeroProbeDidSwitch = false;
            State.buildCategoryPayloadHeroProbeReturnHero = "";
            State.buildCategoryPayloadCorruptRepairActive = false;
            State.buildCategoryPayloadCorruptRepairCleared = false;
            ResetBuildCategoryPayloadProbeInitState();
        }; }],
        ["mergeConfig", function() { return (typeof QOL !== "undefined" && QOL.mergeConfig) || _MC; }],
        ["queueBuildSaveRequestFromLoader", function() { return QueueBuildSaveRequestFromLoader; }],
        ["setSettingsLoaderStepState", function() { return QOL.setSettingsLoaderStepState; }],
        ["setStartupCorruptRepairPending", function() { return SetStartupCorruptRepairPending; }],
        ["settingsLoaderDebugLog", function() { return QOL.settingsLoaderDebugLog; }],
        ["tryReadAccountIdFromKnownPartyPath", function() { return TryReadAccountIdFromKnownPartyPath; }],
        ["writeStorageConfigRawToUi", function() { return WriteStorageConfigRawToUi; }],
        ["washColorPalette", function() { return QOL_WASH_COLOR_PALETTE; }],
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

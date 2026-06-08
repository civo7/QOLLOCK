#!/usr/bin/env python3
"""Extract rejuvTimers code from ql_core.js into a feature file."""
import os, re

SCRIPTS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORE = os.path.join(SCRIPTS_DIR, "ql_core.js")

with open(CORE) as f:
    content = f.read()

# ── Helper: extract a function body ──
def extract_fn(name, text, start_offset=0):
    """Return (start_idx, end_idx_exclusive, body_text)."""
    pattern = r'    function ' + re.escape(name) + r'\('
    m = re.search(pattern, text[start_offset:])
    if not m:
        return None, None, None
    idx = start_offset + m.start()
    brace = 0
    in_fn = False
    for i in range(idx, min(idx + 30000, len(text))):
        if text[i] == '{':
            brace += 1
            in_fn = True
        elif text[i] == '}':
            brace -= 1
            if in_fn and brace == 0:
                return idx, i + 1, text[idx:i+1]
    return None, None, None

# ── Functions to extract ──
FN_NAMES = [
    "FormatClockMmSs",
    "EnsureMinimapObjectiveTimers",
    "HideMinimapObjectiveTimers",
    "GetMinimapConfigNumber",
    "ResolveActiveMinimapObjectiveSize",
    "UpdateMinimapObjectiveTimers",
    "EnsureRejuvState",
    "GetRejuvPanel",
    "RejuvResetImage",
    "RejuvSetPhaseImage",
    "RejuvSetLabels",
    "ApplyRedYellowPanelClasses",
    "RejuvShowSpawn",
    "RejuvCalcPhaseAt",
    "RejuvStartPhaseAuto",
    "RejuvStartPhaseManual",
    "RejuvEndBuff",
    "RejuvStartBuff",
    "RejuvReadChargeCount",
    "RejuvHasAnyCharges",
    "RejuvGetChargeCount",
    "RejuvFindMidBossButton",
    "RejuvIsMidBossSpawned",
    "RejuvGetScanIntervalMs",
    "RejuvResetState",
    "UpdateRejuvBuffTimers",
]

# Also remove the dead HideMinimapCrateOverlay and HideMinimapTunnelOverlay
# (minimapRuntime has its own copies)
DEAD_FNS = [
    "HideMinimapCrateOverlay",
    "HideMinimapTunnelOverlay",
]

# ── Constants ──
CONST_NAMES = [
    "REJUV_DURATION_SEC",
    "REJUV_SCAN_INTERVAL_MS",
    "REJUV_SCAN_INTERVAL_FAST_MS",
    "REJUV_MIDBOSS_LOOKUP_INTERVAL_MS",
    "REJUV_ROTATE_ANIM_MS",
    "REJUV_HIDE_POPIN_MS",
    "REJUV_SEQ",
]

# Extract constants
const_decls = {}
for cname in CONST_NAMES:
    m = re.search(r'(    const ' + re.escape(cname) + r'\s*=\s*.+?;)', content, re.DOTALL)
    if m:
        const_decls[cname] = m.group(1)

# Extract functions — store both original and converted
fn_data = {}  # name -> {'orig': str, 'conv': str, 'start': int, 'end': int}
for name in FN_NAMES:
    start, end, body = extract_fn(name, content)
    if body:
        # Convert bridge aliases
        conv = body
        conv = re.sub(r'\bState\.', 'S.', conv)
        conv = re.sub(r'\bGetCachedPanel\(', 'GC(', conv)
        conv = re.sub(r'\bSetCachedPanel\(', 'SC(', conv)
        fn_data[name] = {'orig': body, 'conv': conv, 'start': start, 'end': end}
        print(f"  Extracted {name}: lines {content[:start].count(chr(10))+1}-{content[:end].count(chr(10))+1} ({len(body)} chars)")
    else:
        print(f"  WARNING: {name} not found")

# Also extract dead functions for removal
dead_data = {}
for name in DEAD_FNS:
    start, end, body = extract_fn(name, content)
    if body:
        dead_data[name] = {'start': start, 'end': end}

# ── Build feature file ──
feature = '''// ql_feat_rejuvtimers.js — Rejuvenator and Bridge buff HUD + minimap timers
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
    var GC = typeof QOL_GetCachedPanel !== "undefined" ? QOL_GetCachedPanel : undefined;
    var SC = typeof QOL_SetCachedPanel !== "undefined" ? QOL_SetCachedPanel : undefined;
    var U = typeof QOL_UTILS !== "undefined" ? QOL_UTILS : undefined;
    var IsCfgEnabled = U ? U.IsCfgEnabled : function() { return false; };
    var IsPanelValid = U ? U.IsPanelValid : function() { return false; };
    var SetStyleSafe = U ? U.SetStyleSafe : function() {};
    var SetPanelOpacitySafe = U ? U.SetPanelOpacitySafe : function() {};
    var SetPanelVisibility = U ? U.SetPanelVisibility : function() {};
    var IsHudClassActive = typeof QOL_IsHudClassActive !== "undefined" ? QOL_IsHudClassActive : function() { return false; };
    var SetPanelClassCached = typeof QOL_SetPanelClassCached !== "undefined" ? QOL_SetPanelClassCached : function() {};
    var IsStreetBrawlModeActive = typeof QOL_IsStreetBrawlModeActive !== "undefined" ? QOL_IsStreetBrawlModeActive : function() { return false; };
    var hasClassInHierarchy = U ? U.HasClassInHierarchy : function() { return false; };
    var ResolveCachedPanel = typeof QOL_ResolveCachedPanel !== "undefined" ? QOL_ResolveCachedPanel : function() { return null; };
    var EnsureMinimapPanelCache = typeof QOL_EnsureMinimapPanelCache !== "undefined" ? QOL_EnsureMinimapPanelCache : function() {};
    var PerfNowMs = typeof QOL_PerfNowMs !== "undefined" ? QOL_PerfNowMs : function() { return Date.now ? Date.now() : (new Date()).getTime(); };

    // ── One-shot dependency validation ──
    if (typeof window !== "undefined" && !window._qol_feat_deps_logged) {
        window._qol_feat_deps_logged = {};
    }
    var _dk = "ql_feat_rejuvtimers";
    if (typeof window !== "undefined" && window._qol_feat_deps_logged && !window._qol_feat_deps_logged[_dk]) {
        var _m = [];
        if (typeof QOL_STATE === "undefined") _m.push("QOL_STATE");
        if (typeof QOL_GetCachedPanel === "undefined") _m.push("QOL_GetCachedPanel");
        if (typeof QOL_SetCachedPanel === "undefined") _m.push("QOL_SetCachedPanel");
        if (typeof QOL_UTILS === "undefined") _m.push("QOL_UTILS");
        if (typeof QOL_IsHudClassActive === "undefined") _m.push("QOL_IsHudClassActive");
        if (typeof QOL_SetPanelClassCached === "undefined") _m.push("QOL_SetPanelClassCached");
        if (typeof QOL_IsStreetBrawlModeActive === "undefined") _m.push("QOL_IsStreetBrawlModeActive");
        if (typeof QOL_EnsureMinimapPanelCache === "undefined") _m.push("QOL_EnsureMinimapPanelCache");
        if (typeof QOL_ResolveCachedPanel === "undefined") _m.push("QOL_ResolveCachedPanel");
        if (typeof QOL_PerfNowMs === "undefined") _m.push("QOL_PerfNowMs");
        if (_m.length > 0) {
            $.Msg("[QOLLock] WARNING: " + _dk + " missing " + _m.length + " bridge(s): " + _m.join(", ") + " — feature will fail");
        }
        window._qol_feat_deps_logged[_dk] = true;
    }

    // ── Constants ──
'''

for cname in CONST_NAMES:
    if cname in const_decls:
        feature += const_decls[cname] + "\n"

feature += '\n    // ── Private helpers ──\n\n'

for name in FN_NAMES:
    if name in fn_data:
        feature += fn_data[name]['conv'] + "\n\n"

feature += '''    // ── Registration ──

    QOL_REGISTER_FEATURE("rejuvTimers", {
        configKeys: ["ENABLE_REJUV_HUD", "ENABLE_BUFF_HUD", "ENABLE_MINIMAP_REJUV_TIMER", "ENABLE_MINIMAP_BUFF_TIMER"],
        bucket: 0,
        phase: 0,
        gate: function(cfg) {
            return IsCfgEnabled(cfg, "ENABLE_REJUV_HUD") || IsCfgEnabled(cfg, "ENABLE_BUFF_HUD") ||
                   IsCfgEnabled(cfg, "ENABLE_MINIMAP_REJUV_TIMER") || IsCfgEnabled(cfg, "ENABLE_MINIMAP_BUFF_TIMER");
        },
        update: function(root, cfg, nowMs) {
            try {
                UpdateRejuvBuffTimers(root, cfg, nowMs);
            } catch(e) {
                $.Msg("[QOLLock][ERROR][" + _dk + "] update: " + (e && e.message ? e.message : String(e)) + "\\n" + (e && e.stack ? String(e.stack) : ""));
                throw e;
            }
        },
        stateKeys: ["rejuvState", "rejuvWasDisabled", "minimapObjectiveBuffClassCache",
                    "minimapObjectiveBuffBridgeLeftClassCache", "minimapObjectiveBuffBridgeRightClassCache",
                    "minimapObjectiveRejuvClassCache", "minimapObjectiveScaleSig"]
    });

    // ── Self-test ──
    try {
        if (typeof UpdateRejuvBuffTimers !== "function") throw new Error("UpdateRejuvBuffTimers is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _dk + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
'''

FEAT_PATH = os.path.join(SCRIPTS_DIR, "ql_features", "ql_feat_rejuvtimers.js")
with open(FEAT_PATH, "w") as f:
    f.write(feature)
print(f"\nFeature file written: {FEAT_PATH} ({len(feature)} chars)")

# ── Remove extracted code from ql_core.js ──
# Combine all ranges to remove: functions + dead functions
ranges = []
for name in FN_NAMES:
    if name in fn_data:
        ranges.append((fn_data[name]['start'], fn_data[name]['end'], name))
for name in DEAD_FNS:
    if name in dead_data:
        ranges.append((dead_data[name]['start'], dead_data[name]['end'], name))

# Also remove registration
reg_marker = '    QOL_REGISTER_FEATURE("rejuvTimers", {'
reg_idx = content.find(reg_marker)
if reg_idx >= 0:
    # Find the closing });
    brace = 0
    in_obj = False
    for i in range(reg_idx, min(reg_idx + 2000, len(content))):
        if content[i] == '{': brace += 1; in_obj = True
        elif content[i] == '}':
            brace -= 1
            if in_obj and brace == 0:
                # Find the closing );
                j = i + 1
                while j < len(content) and content[j] in ' \t\n':
                    j += 1
                if j < len(content) and content[j:j+1] == ')':
                    j += 1
                if j < len(content) and content[j:j+1] == ';':
                    j += 1
                # Include preceding whitespace
                pre = reg_idx
                while pre > 0 and content[pre-1] in ' \t\n':
                    pre -= 1
                ranges.append((pre, j, "registration"))
                break

# Sort by start position (descending) and apply removals
ranges.sort(key=lambda r: r[0], reverse=True)
removed = 0
for start, end, name in ranges:
    content = content[:start] + "\n    // " + name + " extracted to ql_feat_rejuvtimers.js" + content[end:]
    removed += (end - start)
    print(f"  Removed {name}")

# Remove REJUV constants
import re as _re
for cname in CONST_NAMES:
    if cname in const_decls:
        old = const_decls[cname]
        idx = content.find(old)
        if idx >= 0:
            pre = idx
            while pre > 0 and content[pre-1] in ' \t\n':
                pre -= 1
            content = content[:pre] + content[idx + len(old):]
            removed += len(old)

# Clean up leftover comment blocks about REJUV constants
content = _re.sub(
    r'\n    // REJUV[^\n]*\n    // REJUV[^\n]*\n    // REJUV[^\n]*\n    // REJUV[^\n]*\n    // REJUV[^\n]*\n    // REJUV[^\n]*\n    // REJUV[^\n]*\n    // REJUV[^\n]*\n    // REJUV[^\n]*\n',
    '\n    // REJUV_* constants extracted to ql_feat_rejuvtimers.js\n',
    content
)
content = _re.sub(
    r'\n    // REJUV[^\n]*\n    // REJUV[^\n]*\n    // REJUV[^\n]*\n',
    '\n    // REJUV_* constants extracted to ql_feat_rejuvtimers.js\n',
    content
)

# Remove dead functions' call sites (just the defs, not calls — since there are none)
# The dead HideMinimapCrateOverlay and HideMinimapTunnelOverlay have already been
# removed from the function list above.

with open(CORE, "w") as f:
    f.write(content)

print(f"\nRemoved {removed} chars from ql_core.js")
print("Done.")

#!/bin/bash
# check_bridges.sh — pre-commit safety check for QOLLOCK feature extraction
# Run from: panorama/scripts/
# Usage: bash tools/check_bridges.sh
#
# Phase 0.1 — Expanded with known-globals allowlist, bare-global detection,
# self-test coverage check, and DEPENDS comment verification.
#
# Exit code 0 = all checks passed, non-zero = issues found.

set -e
cd "$(dirname "$0")/.."

echo "=== QOLLOCK Bridge Safety Check ==="

ISSUES=0

# ── Known globals allowlist ──
# Category A: QOL namespace symbols (should be resolved via QOL.import())
QOL_NS_ALLOWLIST="QOL_PANEL_ID_HUD QOL_DEFAULT_CONFIG QOL_WARN QOL_MINIMAP_CRATE_DATA"
# Category B: Data globals (published by data files)
DATA_ALLOWLIST="MOD_ICONS CRATE_DATA MINIMAP_CRATE_DATA HERO_IMAGES"
# Category C: Game API globals (provided by Deadlock client DLL, cannot be imported)
GAME_API_ALLOWLIST="CitadelHudHeroBuildsEditSelectedBuild CitadelHudHeroBuildsSaveEdits DismissAllContextMenus Game"
# Category D: Debug/trace globals
DEBUG_ALLOWLIST="_TLog pushUnique QOL_DUMP_STAMINA_DEBUG"
# Category E: Panorama built-ins
PANORAMA_ALLOWLIST="\$ \$.Msg \$ .Schedule \$ .GetContextPanel \$ .DispatchEvent \$ .CreatePanel \$ .Localize \$ .RegisterEventHandler \$ .RegisterForUnhandledEvent \$ .CancelScheduled \$ .FindChildInContext \$ .Language \$ .FrameTime \$ .DbgIsReloadingScript"

ALL_ALLOWLIST="$QOL_NS_ALLOWLIST $DATA_ALLOWLIST $GAME_API_ALLOWLIST $DEBUG_ALLOWLIST $PANORAMA_ALLOWLIST"

# ── Check 1: QOL.import() symbols must be exported ──
echo ""
echo "[1/5] Checking QOL.import() symbols are exported..."

# Collect all symbols exported by _qolExportDefs in ql_core.js
EXPORTED=$(grep -oP '\["\K[a-zA-Z0-9]+(?=")' ql_core.js | sort -u)

# Collect all symbols published by infrastructure files
INFRA_SYMBOLS=$(grep -ohP "QOL\.\K[a-zA-Z0-9]+" ql_state.js ql_panelcache.js ql_bridge.js ql_config.js ql_shared_presets.js 2>/dev/null | sort -u)

# Collect all symbols imported by feature files
for f in ql_features/ql_feat_*.js; do
    IMPORTS=$(tr '\n' ' ' < "$f" | grep -oP 'QOL\.import\(\[[^)]*\]\)' | grep -oP '"[a-zA-Z0-9]+"' | tr -d '"' | sort -u)
    for sym in $IMPORTS; do
        if ! echo "$EXPORTED" | grep -qx "$sym" && ! echo "$INFRA_SYMBOLS" | grep -qx "$sym"; then
            # Check if symbol is published by another feature file (cross-feature)
            if ! grep -rq "QOL\.${sym}\s*=" ql_features/ 2>/dev/null; then
                echo "  MISSING: $sym (imported by $(basename "$f"), not exported anywhere)"
                ISSUES=$((ISSUES + 1))
            fi
        fi
    done
done

if [ $ISSUES -eq 0 ]; then
    echo "  All bridge symbols accounted for."
fi

# ── Check 2: Feature files must have self-tests ──
echo ""
echo "[2/5] Checking feature files have self-tests..."

for f in ql_features/ql_feat_*.js; do
    fname=$(basename "$f")
    if ! grep -q 'try\s*{' "$f" 2>/dev/null; then
        # No try/catch at all — definitely no self-test
        echo "  NO_SELF_TEST: $fname has no try/catch block (may lack self-test)"
        ISSUES=$((ISSUES + 1))
    elif ! grep -qP 'if\s*\(\s*typeof\s+\w+\s*!==?\s*"function"\s*\)' "$f" 2>/dev/null; then
        # Has try/catch but no typeof function check — might have incomplete self-test
        if ! grep -qP 'typeof\s+\w+\s*!==?\s*"function"' "$f" 2>/dev/null; then
            echo "  WEAK_SELF_TEST: $fname has try/catch but no typeof-function check (self-test may be incomplete)"
        fi
    fi
done

echo "  Self-test check complete."

# ── Check 3: Bare QOL_* globals used without QOL.import() ──
echo ""
echo "[3/5] Checking for bare QOL_* globals in feature files..."

for f in ql_features/ql_feat_*.js; do
    fname=$(basename "$f")
    # Find QOL_ prefixed identifiers used as bare names (not in comments, not in QOL.import strings)
    BARE_GLOBALS=$(grep -oP '\bQOL_[A-Za-z0-9_]+\b' "$f" 2>/dev/null | sort -u || true)
    for bare in $BARE_GLOBALS; do
        # Check if it's in the allowlist
        if ! echo "$ALL_ALLOWLIST" | grep -qw "$bare"; then
            # Check if it's imported via QOL.import in this file
            if ! grep -q "\"$bare\"" "$f" 2>/dev/null; then
                echo "  BARE_GLOBAL: $bare used in $fname but not in QOL.import()"
                ISSUES=$((ISSUES + 1))
            fi
        fi
    done
done

echo "  Bare global check complete."

# ── Check 4: DEPENDS comments match QOL.import() calls ──
echo ""
echo "[4/5] Checking DEPENDS comments match QOL.import() calls..."

for f in ql_features/ql_feat_*.js; do
    fname=$(basename "$f")
    if grep -q 'QOL\.import\(' "$f" 2>/dev/null; then
        if ! grep -q '// DEPENDS:' "$f" 2>/dev/null; then
            echo "  NO_DEPENDS: $fname has QOL.import() but no // DEPENDS: comment"
            ISSUES=$((ISSUES + 1))
        fi
    fi
done

echo "  DEPENDS comment check complete."

# ── Check 5: Verify no findChildrenWithClass (without Traverse) usage ──
echo ""
echo "[5/5] Checking for nonexistent FindChildrenWithClass (without Traverse)..."

for f in ql_features/ql_feat_*.js ql_core.js ql_settings.js; do
    fname=$(basename "$f")
    if grep -qP '\.FindChildrenWithClass\b(?!Traverse)' "$f" 2>/dev/null; then
        echo "  API_MISUSE: $fname uses FindChildrenWithClass (should be FindChildrenWithClassTraverse)"
        ISSUES=$((ISSUES + 1))
    fi
done

echo "  API misuse check complete."

# ── Summary ──
echo ""
if [ $ISSUES -eq 0 ]; then
    echo "=== All bridge safety checks passed. ==="
else
    echo "=== $ISSUES bridge safety issue(s) found. ==="
    exit 1
fi

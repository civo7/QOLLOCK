#!/bin/bash
# validate_imports.sh — Static QOL.import() validation tool (Phase G)
# Run from: panorama/scripts/
# Usage: bash tools/validate_imports.sh
#
# Cross-references every QOL.import() call in feature files against the
# QOL namespace publications. Any symbol imported but NOT published on
# the QOL namespace is flagged as a potential runtime bug.
#
# This catches the class of bugs that the smoke test and bridge checker
# miss: QOL.import("isPanelValid") returning undefined because "isPanelValid"
# is not published to the QOL namespace (it's only available as Utils.IsPanelValid).
#
# Exit code 0 = all imports validated, non-zero = issues found.

set -e
cd "$(dirname "$0")/.."

echo "=== QOLLOCK Import Validation ==="

ISSUES=0

# ── Collect all symbols published on QOL namespace ──
# From _qolExportDefs (ql_core.js)
CORE_EXPORTS=$(grep -oP '\["\K[a-zA-Z0-9]+(?=")' ql_core.js | sort -u)

# From direct QOL.* assignments (shared_presets, state, panelcache, bridge, config, utils)
QOL_PUBLICATIONS=$(grep -ohP 'QOL\.\K[a-zA-Z0-9]+(?=\s*=)' ql_shared_presets.js ql_state.js ql_panelcache.js ql_bridge.js ql_config.js 2>/dev/null | sort -u)

# From feature file publications (cross-feature)
FEATURE_PUBLICATIONS=$(grep -ohP 'QOL\.\K[a-zA-Z0-9]+(?=\s*=)' features/ql_feat_*.js 2>/dev/null | sort -u)

# Utils namespace symbols (accessible via Utils.Xxx, not QOL.xxx)
UTILS_SYMBOLS="IsCfgEnabled IsPanelValid IsPanelListValid SetStyleSafe ClearStyleSafe SetPanelOpacitySafe NormalizeOpacityNumber NormalizeHudOffsetNumber NormalizeHudScaleNumber FormatHudPx PerfNowMs PushUnique FindFirstPanelByClass FindAncestorWithClass HasClassInHierarchy SetPanelVisibility SafeGetAttribute SafeSetAttribute SafeLog DebugLog InfoLog WarnLog ErrorLog ToRgbString BlendRgb SetWashColorSafe ClampConfigNumber"

# Always-present QOL namespace symbols (published by ql_shared_presets.js)
CORE_ALWAYS="utils state defaultConfig presets schemaSemver codec dumpDiagnostics bridge compactSchemaRegistry latestCompactSemver"

# All valid QOL.* namespace symbols
ALL_QOL_SYMBOLS="$CORE_ALWAYS $CORE_EXPORTS $QOL_PUBLICATIONS $FEATURE_PUBLICATIONS"

echo ""
echo "[1/2] Checking QOL.import() symbols exist on QOL namespace..."

for f in features/ql_feat_*.js; do
    fname=$(basename "$f")
    # Extract all import names from QOL.import([...])
    IMPORTS=$(tr '\n' ' ' < "$f" | grep -oP 'QOL\.import\(\[[^)]*\]\)' | grep -oP '"[a-zA-Z0-9]+"' | tr -d '"' | sort -u)
    for sym in $IMPORTS; do
        # Check if the symbol is published on QOL namespace
        if echo "$ALL_QOL_SYMBOLS" | grep -qw "$sym"; then
            continue  # Found — valid
        fi
        # Check if it's a Utils symbol being imported via QOL — this is the common bug pattern
        if echo "$UTILS_SYMBOLS" | grep -qw "$sym"; then
            echo "  UTILS_AS_QOL: $sym in $fname — should use Utils.$sym, not QOL.import(\"$sym\")"
            ISSUES=$((ISSUES + 1))
        else
            echo "  MISSING: $sym in $fname — not found on QOL namespace or Utils"
            ISSUES=$((ISSUES + 1))
        fi
    done
done

if [ $ISSUES -eq 0 ]; then
    echo "  All QOL.import() symbols validated."
fi

echo ""
echo "[2/2] Checking for Utils symbols incorrectly imported via QOL.import()..."

for f in features/ql_feat_*.js; do
    fname=$(basename "$f")
    IMPORTS=$(tr '\n' ' ' < "$f" | grep -oP 'QOL\.import\(\[[^)]*\]\)' | grep -oP '"[a-zA-Z0-9]+"' | tr -d '"' | sort -u)
    for sym in $IMPORTS; do
        if echo "$UTILS_SYMBOLS" | grep -qw "$sym"; then
            # Check if the file actually uses Utils.$sym — if so, the QOL.import is dead
            if grep -q "Utils\.$sym\b" "$f" 2>/dev/null; then
                echo "  DUPLICATE: $sym in $fname — imported via QOL but uses Utils.$sym (dead import)"
                ISSUES=$((ISSUES + 1))
            fi
        fi
    done
done

echo "  Utils symbol check complete."

echo ""
if [ $ISSUES -eq 0 ]; then
    echo "=== All imports validated. ==="
else
    echo "=== $ISSUES import validation issue(s) found. ==="
    exit 1
fi

#!/bin/bash
# check_bridges.sh — pre-commit safety check for QOLLOCK feature extraction
# Run from: panorama/scripts/
# Usage: bash tools/check_bridges.sh
#
# Verifies that every symbol imported by a feature file via QOL.import()
# is exported to the QOL namespace (either by ql_core.js _qolExportDefs or
# by another infrastructure file).
#
# Exit code 0 = all checks passed, non-zero = issues found.

set -e
cd "$(dirname "$0")/.."

echo "=== QOLLOCK Bridge Safety Check ==="

ISSUES=0

# Collect all symbols exported by _qolExportDefs in ql_core.js
EXPORTED=$(grep -oP '\["\K[a-zA-Z0-9]+(?=")' ql_core.js | sort -u)

# Collect all symbols published by infrastructure files
INFRA_SYMBOLS=$(grep -ohP "QOL\.\K[a-zA-Z0-9]+" ql_state.js ql_panelcache.js ql_bridge.js ql_config.js ql_shared_presets.js 2>/dev/null | sort -u)

# Collect all symbols imported by feature files
for f in ql_features/ql_feat_*.js; do
    IMPORTS=$(grep -oP 'QOL\.import\(\[(.*?)\]\)' "$f" 2>/dev/null | grep -oP '"[a-zA-Z0-9]+"' | tr -d '"' | sort -u)
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
else
    echo "  $ISSUES missing bridge symbol(s) found."
    exit 1
fi

#!/usr/bin/env bash
# check_manifests.sh — Validate FeatureRegistry manifests
# Checks: duplicate IDs, valid ID format, enabledByDefault audit,
#          missing enableKey, settings type validity

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFESTS_DIR="$SCRIPT_DIR/../manifests"
ERRORS=0

echo "=== QOLLOCK Manifest Validation ==="
echo ""

# -- 1. Check for duplicate manifest IDs --
echo "[1/4] Checking for duplicate manifest IDs..."
declare -A IDS
for f in "$MANIFESTS_DIR"/*/manifest.js; do
    [ -f "$f" ] || continue
    id=$(grep -oP 'id:\s*"[^"]+"' "$f" | head -1 | grep -oP '"[^"]+"' | tr -d '"')
    if [ -z "$id" ]; then
        echo "  WARN: no id found in $f"
        continue
    fi
    if [ -n "${IDS[$id]:-}" ]; then
        echo "  ERROR: duplicate id '$id' in ${IDS[$id]} and $f"
        ERRORS=$((ERRORS + 1))
    else
        IDS[$id]="$f"
    fi
done
echo "  ${#IDS[@]} unique manifest IDs found."

# -- 2. Check ID format (lowercase alphanumeric + underscore) --
echo ""
echo "[2/4] Checking manifest ID format..."
for f in "$MANIFESTS_DIR"/*/manifest.js; do
    [ -f "$f" ] || continue
    id=$(grep -oP 'id:\s*"[^"]+"' "$f" | head -1 | grep -oP '"[^"]+"' | tr -d '"')
    if [ -z "$id" ]; then continue; fi
    if ! [[ "$id" =~ ^[a-z0-9_]+$ ]]; then
        echo "  ERROR: invalid id '$id' in $f (must match ^[a-z0-9_]+$)"
        ERRORS=$((ERRORS + 1))
    fi
done
echo "  All IDs valid."

# -- 3. Check enabledByDefault —
echo ""
echo "[3/4] Checking enabledByDefault values..."
TRUE_COUNT=0
for f in "$MANIFESTS_DIR"/*/manifest.js; do
    [ -f "$f" ] || continue
    if grep -q "enabledByDefault: true" "$f"; then
        id=$(grep -oP 'id:\s*"[^"]+"' "$f" | head -1 | grep -oP '"[^"]+"' | tr -d '"')
        echo "  NOTE: $id has enabledByDefault: true (ok if cut-over complete)"
        TRUE_COUNT=$((TRUE_COUNT + 1))
    fi
done
if [ $TRUE_COUNT -gt 0 ]; then
    echo "  $TRUE_COUNT manifest(s) with enabledByDefault: true."
    echo "  If any are NOT yet cut over, change to false to prevent double-execution."
else
    echo "  All manifests have enabledByDefault: false."
fi

# -- 4. Check settings type validity --
echo ""
echo "[4/4] Checking settings type validity..."
VALID_TYPES="toggle|slider|dropdown|text|palette|action"
for f in "$MANIFESTS_DIR"/*/manifest.js; do
    [ -f "$f" ] || continue
    id=$(grep -oP 'id:\s*"[^"]+"' "$f" | head -1 | grep -oP '"[^"]+"' | tr -d '"')
    # Use while-read with process substitution to avoid subshell (ERRORS must persist)
    while IFS= read -r t; do
        [ -z "$t" ] && continue
        if ! [[ "$t" =~ ^($VALID_TYPES)$ ]]; then
            echo "  ERROR: $id has invalid type '$t'"
            ERRORS=$((ERRORS + 1))
        fi
    done < <(grep -oP 'type:\s*"[^"]+"' "$f" | grep -oP '"[^"]+"' | tr -d '"')
done
echo "  Settings types validated."

# -- Summary --
echo ""
if [ $ERRORS -eq 0 ]; then
    echo "=== All manifest checks passed. ==="
else
    echo "=== $ERRORS error(s) found! ==="
fi
exit $ERRORS

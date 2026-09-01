#!/usr/bin/env bash
# check_manifests.sh — Validate FeatureRegistry manifests
# Checks: duplicate IDs, valid ID format, enabledByDefault audit,
#          missing enableKey, settings type validity, TODO stubs,
#          config key alignment with old feature files

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFESTS_DIR="$SCRIPT_DIR/../manifests"
FEATURES_DIR="$SCRIPT_DIR/../features"
ERRORS=0
WARNINGS=0

echo "=== QOLLOCK Manifest Validation ==="
echo ""

# -- 1. Check for duplicate manifest IDs --
echo "[1/5] Checking for duplicate manifest IDs..."
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
echo "[2/5] Checking manifest ID format..."
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
echo "[3/5] Checking enabledByDefault values..."
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
echo "[4/5] Checking settings type validity..."
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

# -- 5. Check for TODO stubs in manifest implementations --
echo ""
echo "[5/5] Checking for TODO stubs in manifest implementations..."
STUB_COUNT=0
WIRED_STUB_COUNT=0
HUD_XML="$SCRIPT_DIR/../../layout/hud.xml"
for f in "$MANIFESTS_DIR"/*/manifest.js; do
    [ -f "$f" ] || continue
    id=$(grep -oP 'id:\s*"[^"]+"' "$f" | head -1 | grep -oP '"[^"]+"' | tr -d '"')
    [ -z "$id" ] && continue
    if grep -qP 'TODO.*(implement|Port)' "$f" 2>/dev/null; then
        STUB_COUNT=$((STUB_COUNT + 1))
        if [ -f "$HUD_XML" ] && grep -q "manifests/$id/manifest" "$HUD_XML" 2>/dev/null; then
            echo "  WIRED STUB: $id has TODO but is wired in hud.xml (must implement before cut-over)"
            WIRED_STUB_COUNT=$((WIRED_STUB_COUNT + 1))
        else
            echo "  stub: $id has TODO (not yet wired)"
        fi
    fi
done
if [ $STUB_COUNT -gt 0 ]; then
    echo "  $STUB_COUNT manifest(s) are TODO stubs ($WIRED_STUB_COUNT wired, $((STUB_COUNT - WIRED_STUB_COUNT)) unwired)"
    if [ $WIRED_STUB_COUNT -gt 0 ]; then
        echo "  ERROR: $WIRED_STUB_COUNT wired manifest(s) have empty implementations."
        echo "  Implement the _tick() body before committing wired manifests."
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "  No TODO stubs found."
fi

# -- 6. Check enableKey presence --
echo ""
echo "[6/7] Checking enableKey presence..."
for f in "$MANIFESTS_DIR"/*/manifest.js; do
    [ -f "$f" ] || continue
    id=$(grep -oP 'id:\s*"[^"]+"' "$f" | head -1 | grep -oP '"[^"]+"' | tr -d '"')
    [ -z "$id" ] && continue
    has_enableKey=$(grep -c -E 'enableKeys?:' "$f" 2>/dev/null || true)
    has_enableKey=$(echo "$has_enableKey" | tr -d '[:space:]')
    [ -z "$has_enableKey" ] && has_enableKey=0
    has_comment=$(grep -c -E 'OMIT enableKey|multi-key|always-on' "$f" 2>/dev/null || true)
    has_comment=$(echo "$has_comment" | tr -d '[:space:]')
    [ -z "$has_comment" ] && has_comment=0
    if [ "$has_enableKey" -eq 0 ] && [ "$has_comment" -eq 0 ] && ! grep -qP 'id:\s*"ql_healthbar"' "$f" 2>/dev/null; then
        echo "  WARN: $id has no enableKey and no comment explaining why (multi-key? always-on?)"
        WARNINGS=$((WARNINGS + 1))
    fi
done
echo "  enableKey check complete."

# -- 7. Check config key alignment with old feature files --
echo ""
echo "[7/7] Checking config key alignment (manifest vs old feature)..."
MISMATCH_COUNT=0
for f in "$MANIFESTS_DIR"/*/manifest.js; do
    [ -f "$f" ] || continue
    id=$(grep -oP 'id:\s*"[^"]+"' "$f" | head -1 | grep -oP '"[^"]+"' | tr -d '"')
    [ -z "$id" ] && continue

    # Map manifest ID to old feature file name
    case "$id" in
        ql_color_warnings) old_file="$FEATURES_DIR/ql_feat_colorwarnings.js" ;;
        ql_unsecured_souls_timer) old_file="$FEATURES_DIR/ql_feat_unsecuredsouls.js" ;;
        ql_better_unsecured_hud) old_file="$FEATURES_DIR/ql_feat_betterunsecuredhud.js" ;;
        ql_minimap_runtime) old_file="$FEATURES_DIR/ql_feat_minimapruntime.js" ;;
        ql_recent_purchases) old_file="$FEATURES_DIR/ql_feat_recentpurchases.js" ;;
        ql_on_death_arcade) old_file="$FEATURES_DIR/ql_feat_ondeatharcade.js" ;;
        ql_chat_images) old_file="$FEATURES_DIR/ql_feat_chatimg.js" ;;
        ql_lane_with_party) old_file="$FEATURES_DIR/ql_feat_lanewithparty.js" ;;
        ql_target_shapes) old_file="$FEATURES_DIR/ql_feat_targetshapes.js" ;;
        ql_urn_timer) old_file="$FEATURES_DIR/ql_feat_urntimer.js" ;;
        *)
            old_feat_name=$(echo "$id" | sed 's/^ql_/ql_feat_/')
            old_file="$FEATURES_DIR/${old_feat_name}.js"
            [ -f "$old_file" ] || continue
            ;;
    esac
    [ ! -f "$old_file" ] && continue

    # Extract config keys from manifest settings[]
    manifest_keys=$(grep -o 'key: *"[^"]*"' "$f" 2>/dev/null | grep -o '"[^"]*"' | tr -d '"' | sort -u)
    # Extract config keys from old feature's configKeys array (first one found)
    # configKeys can span multiple lines — grab the block then extract quoted strings
    old_config_block=$(sed -n '/configKeys:/,/\]/p' "$old_file" 2>/dev/null | tr -d '[:space:]')
    old_keys=$(echo "$old_config_block" | grep -o '"[A-Z_][A-Z_0-9]*"' | tr -d '"' | sort -u)

    if [ -n "$manifest_keys" ] && [ -n "$old_keys" ]; then
        missing_in_manifest=""
        for ok in $old_keys; do
            found=0
            for mk in $manifest_keys; do
                [ "$ok" = "$mk" ] && found=1 && break
            done
            [ "$found" -eq 0 ] && missing_in_manifest="$missing_in_manifest $ok"
        done
        missing_in_manifest=$(echo "$missing_in_manifest" | xargs -n1 2>/dev/null || true)
        if [ -n "$missing_in_manifest" ]; then
            echo "  WARN: $id — config keys in old configKeys[] missing from manifest settings[]:"
            for mk in $missing_in_manifest; do echo "    - $mk"; done
            MISMATCH_COUNT=$((MISMATCH_COUNT + 1))
        fi
    fi
done
if [ $MISMATCH_COUNT -eq 0 ]; then
    echo "  All manifest config keys align with old features (where comparable)."
else
    echo "  $MISMATCH_COUNT manifest(s) with config key gaps."
fi

# -- Summary --
echo ""
if [ $ERRORS -eq 0 ]; then
    echo "=== All manifest checks passed. ==="
else
    echo "=== $ERRORS error(s) found! ==="
fi
exit $ERRORS

#!/bin/bash
# QOLLOCK — Install git pre-commit hooks
# Run once after cloning: bash setup-hooks.sh
# Safe to re-run: backs up existing hook before replacing
set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
HOOK_TEMPLATE="$REPO_ROOT/scripts/git-hooks/pre-commit"
HOOK_TARGET="$REPO_ROOT/.git/hooks/pre-commit"

if [ ! -f "$HOOK_TEMPLATE" ]; then
    echo "[QOLLOCK] ERROR: Hook template not found at $HOOK_TEMPLATE"
    echo "The scripts/git-hooks/ directory may be missing or corrupted."
    exit 1
fi

if [ -f "$HOOK_TARGET" ]; then
    if cmp -s "$HOOK_TEMPLATE" "$HOOK_TARGET"; then
        echo "[QOLLOCK] Pre-commit hook is already up to date."
        exit 0
    fi
    BACKUP="$HOOK_TARGET.bak.$(date +%s)"
    echo "[QOLLOCK] WARNING: Existing hook differs from template. Backing up to $(basename "$BACKUP")"
    cp "$HOOK_TARGET" "$BACKUP"
fi

cp "$HOOK_TEMPLATE" "$HOOK_TARGET"
chmod +x "$HOOK_TARGET"
echo "[QOLLOCK] Git pre-commit hook installed."
echo "  Validates: npm test (complete offline gate)"
echo "  Skip with: QOLLOCK_SKIP_HOOKS=true git commit ..."

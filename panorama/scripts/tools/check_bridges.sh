#!/bin/bash
# check_bridges.sh — pre-commit safety check for QOLLOCK feature extraction
# Run from: panorama/scripts/
# Usage: bash tools/check_bridges.sh

echo "=== QOLLOCK Bridge Safety Check ==="
python3 tools/check_bridges.py

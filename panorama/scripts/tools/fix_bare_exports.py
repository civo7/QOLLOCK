#!/usr/bin/env python3
"""Add missing bare-global QOL_* bridge exports to ql_core.js.

Feature files use `typeof QOL_X !== "undefined"` which checks for a bare global.
But many QOL_* exports only exist on `window.QOL_X`. This script adds the
corresponding bare-global export for every window-only export.
"""
import os, re, sys

SCRIPTS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORE_PATH = os.path.join(SCRIPTS_DIR, "ql_core.js")

with open(CORE_PATH) as f:
    content = f.read()

lines = content.split("\n")
result = []
added = 0
i = 0
while i < len(lines):
    line = lines[i]
    m = re.search(
        r'if \(typeof window !== "undefined"\) window\.(QOL_\w+) = (\w+);',
        line,
    )
    if m:
        bare_name = m.group(1)
        fn_name = m.group(2)
        bare_line = '    try { ' + bare_name + ' = ' + fn_name + '; } catch(e) {}'

        # Check if the previous line already has the bare-global version
        have_bare = (i > 0 and bare_name in lines[i - 1])

        if not have_bare:
            result.append(bare_line)
            added += 1

        result.append(line)
    else:
        result.append(line)
    i += 1

with open(CORE_PATH, "w") as f:
    f.write("\n".join(result))

print(f"Added {added} missing bare-global bridge exports.")

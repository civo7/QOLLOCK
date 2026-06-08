#!/usr/bin/env python3
"""Fix missing U.* aliases in feature files after QOL.import() migration.

The linter removed `var IsCfgEnabled = U.IsCfgEnabled` etc. when converting
to QOL.import(), but the code still uses these as bare names. This adds
the missing aliases back.
"""
import os, re

FEAT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ql_features")

# U methods that might need aliasing, with their safe fallbacks
U_ALIASES = {
    "IsCfgEnabled":      None,  # no fallback — if U is defined, this works
    "IsPanelValid":      None,
    "SetStyleSafe":      None,
    "ClearStyleSafe":    None,
    "SetPanelOpacitySafe": None,
    "SetPanelVisibility": None,
    "SetPanelClassIfChanged": None,
    "IsPanelListValid":  None,
    "FindAncestorWithClass": None,
    "HasClassInHierarchy": None,
    "NormalizeOpacityNumber": None,
    "FormatHudPx":       None,
    "PerfNowMs":         None,
}

fixed = 0
for fname in sorted(os.listdir(FEAT_DIR)):
    if not fname.endswith(".js"):
        continue
    fpath = os.path.join(FEAT_DIR, fname)
    with open(fpath) as f:
        content = f.read()

    # Find the `var U = _deps.utils;` line
    u_line_match = re.search(r'^(\s+var U = _deps\.utils;)$', content, re.MULTILINE)
    if not u_line_match:
        continue

    indent = "    "  # default 4-space indent
    insert_pos = u_line_match.end()

    # Build list of missing aliases
    new_aliases = []
    for method, fallback in U_ALIASES.items():
        # Check if bare name is used (not preceded by U., _deps., var, function, or .)
        bare_pattern = r'(?<!U\.)(?<!_deps\.)(?<!var )(?<!function )(?<!\.)\b' + re.escape(method) + r'\b'
        if not re.search(bare_pattern, content):
            continue

        # Check if already aliased
        if f"var {method} =" in content or f"var {method}=" in content:
            continue

        # Build the alias
        if fallback is not None:
            new_aliases.append(f'    var {method} = U ? U.{method} : {fallback};')
        else:
            new_aliases.append(f'    var {method} = U.{method};')

    if not new_aliases:
        continue

    # Insert after the U = _deps.utils line
    insertion = "\n" + "\n".join(new_aliases)
    content = content[:insert_pos] + insertion + content[insert_pos:]

    with open(fpath, "w") as f:
        f.write(content)

    print(f"  Fixed {fname}: +{len(new_aliases)} aliases ({', '.join(a.split()[2].split('=')[0] for a in new_aliases)})")
    fixed += len(new_aliases)

print(f"\nAdded {fixed} aliases across all files.")

#!/usr/bin/env python3
"""trace_deps.py — Recursive dependency tracer for QOLLOCK feature extraction.

Given a feature file and ql_core.js, traces the full transitive closure of
all functions and constants referenced by the feature's update code but not
yet present in the feature file. Extracts definitions from ql_core.js,
converts State.→S. / GetCachedPanel(→GC( / SetCachedPanel(→SC(, and
inserts them into the feature file.

Usage: python3 tools/trace_deps.py ql_features/ql_feat_<name>.js
"""
import os, re, sys

SCRIPTS_DIR = None

# ── Known globals / panel methods / bridge aliases ──
KNOWN = {
    'String','Number','Object','Array','Date','Math','Boolean','isFinite','isNaN',
    'JSON','Error','parseInt','parseFloat','RegExp','Promise','Symbol',
    'AddClass','RemoveClass','BHasClass','SetHasClass','FindChildTraverse',
    'FindChildrenWithClassTraverse','GetChildCount','GetChild','GetParent',
    'SetAttributeString','GetAttributeString','CreatePanel','DeleteAsync',
    'SetPanelEvent','DispatchEvent','RegisterForUnhandledEvent',
    'RegisterEventHandler','Msg','Schedule','GetContextPanel',
    'SetSelected','GetSelected','IsValid','SetImage','style','FindChild',
    'GetUIRoot','SetDialogVariable','FindChildInLayoutFile','indexOf','push',
    'SetAttributeInt','SetAttributeDouble','GetAttributeInt','GetAttributeDouble',
    'MoveChildBefore','MoveChildAfter','SetParent','Visible','ClearPanelStyle',
    'SetFocus','ScrollToTop','ScrollToBottom','SetScroll',
    'RemoveAndDeleteChildren','LoadLayout','LoadLayoutFromString',
    'SetReadyForDisplay','ClearReadyForDisplay','SetChildLockInactive',
    'BLoadLayout','BLoadLayoutFromString','BHasChildInLayout','BHasLayoutLoaded',
    'DataText','GetLocalizedText','SetLocalizedText','SetLocalizedString',
    'SetDialogVariableInt','SetDialogVariableFloat','SetDialogVariableString',
    'SetDialogVariableTime','SetDialogVariableHexColor','FindAncestor',
}

def load_core(path=None):
    """Load ql_core.js and index all functions and constants."""
    if path is None:
        path = os.path.join(SCRIPTS_DIR, "ql_core.js")
    with open(path) as f: core = f.read()

    consts = {}
    for m in re.finditer(r'const (\w+)\s*=\s*(.+?);', core):
        consts[m.group(1)] = m.group(2).strip()

    # Also handle multi-line consts with arrays/objects
    for m in re.finditer(r'const (\w+)\s*=\s*(\[)', core):
        name = m.group(1)
        if name in consts: continue
        start = m.start()
        bracket = 0
        for i in range(start, min(start + 5000, len(core))):
            if core[i] == '[': bracket += 1
            elif core[i] == ']':
                bracket -= 1
                if bracket == 0:
                    consts[name] = core[start + len(f"const {name} = "):i+1].strip()
                    break

    fns = {}
    for m in re.finditer(r'function (\w+)\(', core):
        name = m.group(1)
        if name in fns: continue
        idx = m.start()
        brace = 0; in_fn = False
        for i in range(idx, min(idx + 50000, len(core))):
            if core[i] == '{': brace += 1; in_fn = True
            elif core[i] == '}':
                brace -= 1
                if in_fn and brace == 0:
                    fns[name] = core[idx:i+1]
                    break

    # Also find var-defined functions (var X = function(...) {...})
    for m in re.finditer(r'var (\w+)\s*=\s*function\s*\(', core):
        name = m.group(1)
        if name in fns: continue
        idx = m.start()
        brace = 0; in_fn = False
        for i in range(idx, min(idx + 5000, len(core))):
            if core[i] == '{': brace += 1; in_fn = True
            elif core[i] == '}':
                brace -= 1
                if in_fn and brace == 0:
                    # Check for }; (var assignment) vs just } (function)
                    fns[name] = core[idx:i+1] + ';'
                    break

    return core, consts, fns

def find_refs(body):
    """Find all uppercase identifiers and function calls in body."""
    consts = set()
    fns = set()

    for m in re.finditer(r'\b([A-Z][A-Z_0-9]{2,})\b', body):
        name = m.group(1)
        if name not in KNOWN and not name.startswith('QOL_'):
            consts.add(name)

    for m in re.finditer(r'\b([A-Z][A-Za-z_0-9]+)\s*\(', body):
        name = m.group(1)
        if name not in KNOWN and not name.startswith('QOL_'):
            fns.add(name)

    return consts, fns

def trace(feat_path):
    """Main entry point — trace all missing deps for a feature file."""
    global SCRIPTS_DIR
    feat_path = os.path.abspath(feat_path)
    SCRIPTS_DIR = os.path.dirname(os.path.dirname(feat_path))  # up from ql_features/ to scripts/

    core, core_consts, core_fns = load_core()

    with open(feat_path) as f:
        content = f.read()

    # Collect everything already in the feature file
    have_consts = set()
    have_fns = set()
    for m in re.finditer(r'var (\w+)\s*=', content):
        have_consts.add(m.group(1))
    for m in re.finditer(r'function (\w+)\(', content):
        have_fns.add(m.group(1))
    for m in re.finditer(r'var (\w+)\s*=\s*function', content):
        have_fns.add(m.group(1))

    # Work queue: start with the entire feature body
    body_start = content.find("    function ")
    if body_start == -1: body_start = len(content) // 2
    queue = [content[body_start:]]
    seen = set()

    needed_consts = {}
    needed_fns = {}

    while queue:
        body = queue.pop(0)
        ref_consts, ref_fns = find_refs(body)

        for c in ref_consts:
            if c in seen or c in have_consts or c in needed_consts: continue
            seen.add(c)
            if c in core_consts:
                needed_consts[c] = core_consts[c]

        for fn in ref_fns:
            if fn in seen or fn in have_fns or fn in needed_fns: continue
            seen.add(fn)
            if fn in core_fns:
                fn_code = core_fns[fn]
                needed_fns[fn] = fn_code
                # Recursively trace this function's body
                queue.append(fn_code)

    if not needed_consts and not needed_fns:
        print(f"{feat_path}: All deps satisfied — nothing to add.")
        return

    # Build additions
    additions = ""
    for c in sorted(needed_consts):
        additions += f"\n    var {c} = {needed_consts[c]};"
        print(f"  + const {c}")

    for fn in sorted(needed_fns):
        fn_code = needed_fns[fn]
        # Convert to feature-file naming
        fn_code = fn_code.replace("State.", "S.")
        fn_code = re.sub(r'\bGetCachedPanel\(', 'GC(', fn_code)
        fn_code = re.sub(r'\bSetCachedPanel\(', 'SC(', fn_code)
        additions += "\n" + fn_code
        print(f"  + fn {fn} ({fn_code.count(chr(10))} lines)")

    # Insert before first function definition
    insert_at = content.find("\n    function ")
    if insert_at == -1:
        # Try inserting after bridge section
        dk_match = re.search(r'window\._qol_feat_deps_logged\[_dk\] = true;\s*\}', content)
        if dk_match:
            insert_at = dk_match.end()
        else:
            print("ERROR: Cannot find insertion point")
            return

    content = content[:insert_at] + additions + content[insert_at:]

    with open(feat_path, "w") as f:
        f.write(content)

    # Validate
    import subprocess
    r = subprocess.run(["/usr/bin/node", "--check", feat_path], capture_output=True, text=True)
    if r.returncode == 0:
        print(f"  Valid syntax. Added {len(needed_consts)} consts + {len(needed_fns)} fns.")
    else:
        print(f"  SYNTAX ERROR: {r.stderr[:200]}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 tools/trace_deps.py ql_features/ql_feat_<name>.js")
        sys.exit(1)

    trace(sys.argv[1])

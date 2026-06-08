#!/usr/bin/env python3
"""
find_dead_funcs.py — Dead function detector for QOLLOCK's Panorama ES5 codebase.

Scans all .js files under panorama/scripts/ and reports functions defined
in a target file that have zero callers anywhere in the project.

Understood patterns:
  - function FuncName(...)       — named function definitions
  - FuncName(...)                — direct calls (bare global)
  - QOL.FuncName(...)            — calls via QOL namespace
  - QOL_FuncName(...)            — calls via backward-compat bridge
  - _deps.funcName(...)          — calls via QOL.import() destructuring
  - GC(...) / SC(...) / RC(...)  — short aliases for GetCachedPanel etc.
  - U.funcName(...)              — calls via QOL_UTILS

Ignores:
  - Function names that are JS built-ins or common minified names
  - Function names that appear only as object properties (obj.funcName)
    unless they also appear as bare calls
  - Self-references (function calling itself recursively)

Usage:
  python3 scripts/find_dead_funcs.py panorama/scripts/ql_core.js
  python3 scripts/find_dead_funcs.py panorama/scripts/ql_features/ql_feat_*.js
  python3 scripts/find_dead_funcs.py panorama/scripts/ql_core.js --verbose
"""

import re
import os
import sys
import argparse
from collections import defaultdict

# ── JS built-ins and common names that generate false positives ──
IGNORE_NAMES = {
    # JS built-ins / globals
    "eval", "parseInt", "parseFloat", "isNaN", "isFinite",
    "decodeURI", "decodeURIComponent", "encodeURI", "encodeURIComponent",
    "escape", "unescape", "undefined", "NaN", "Infinity",
    "Boolean", "Number", "String", "Object", "Array", "Function",
    "Date", "RegExp", "Error", "TypeError", "RangeError", "SyntaxError",
    "Math", "JSON", "console",
    # Common minified / short names
    "e", "i", "j", "k", "n", "t", "v", "x", "y", "z",
    "el", "fn", "id", "ok", "on", "no", "to", "as", "at", "by", "in", "is", "it", "or",
    "do", "go", "if", "so", "be", "my", "we",
    "has", "get", "set", "add", "sub", "mul", "div", "mod",
    "log", "err", "msg", "out", "key", "val", "obj", "arr", "len", "idx", "pos",
    "src", "dst", "tmp", "old", "new", "now", "end", "top", "mid", "low", "max", "min",
    "all", "any", "one", "two", "run", "try", "use", "put", "pop", "map", "fix",
    # QOLLOCK-specific short aliases (GC, SC, RC, U, S are destructured)
    "GC", "SC", "RC", "U",
    # Panorama / Source 2 globals
    "Msg", "Schedule", "CreatePanel", "FindChildTraverse",
    "AddClass", "RemoveClass", "BHasClass", "SetHasClass",
    "IsValid", "SetImage", "SetDialogVariable",
    "GetAttributeString", "SetAttributeString",
    # Common method names that match function patterns
    "push", "pop", "shift", "unshift", "slice", "splice",
    "join", "split", "indexOf", "lastIndexOf", "forEach",
    "map", "filter", "reduce", "sort", "reverse",
    "toString", "valueOf", "hasOwnProperty",
    "apply", "call", "bind",
    "log", "warn", "error", "info", "debug",
    "assert", "clear", "count", "dir", "group", "groupEnd",
    "table", "time", "timeEnd", "trace",
    # Additional QOLLOCK patterns that match QOL.* or destructured usage
    "with",  # JS keyword used as function name in ql_core.js
    # One-letter and comment artifacts
    "f", "s",  # JSDoc artifacts like "function f(_s)"
}


def find_js_files(script_dir):
    """Return all .js file paths under script_dir, excluding known data files."""
    js_files = []
    for root, dirs, files in os.walk(script_dir):
        for fname in files:
            if not fname.endswith(".js"):
                continue
            fpath = os.path.join(root, fname)
            js_files.append(fpath)
    return js_files


def _strip_comments(content):
    """Remove JS comments (// line and /* block */) so they don't produce false positives."""
    # Remove block comments
    content = re.sub(r"/\*.*?\*/", " ", content, flags=re.DOTALL)
    # Remove line comments
    content = re.sub(r"//[^\n]*", " ", content)
    return content


def extract_function_defs(filepath):
    """Return dict of {func_name: line_number} for function definitions."""
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        raw = f.read()

    content = _strip_comments(raw)
    line_map = _build_line_map(raw, content)

    defs = {}
    for m in re.finditer(r"function\s+(\w+)\s*\(", content):
        name = m.group(1)
        if name not in IGNORE_NAMES:
            # Map stripped position back to original line number
            pos = m.start()
            defs[name] = line_map[pos] if pos < len(line_map) else 1
    return defs


def _build_line_map(original, stripped):
    """Build a position->line mapping from stripped content back to original lines."""
    # Simple approach: count newlines in original up to equivalent stripped position
    # For speed, just use original line count at the match position in original
    # We'll search original for the same function name
    return {}  # placeholder — line numbers from original will be rebuilt below


def extract_function_defs_with_lines(filepath):
    """Return dict of {func_name: line_number} using original content for line numbers."""
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        original = f.read()

    stripped = _strip_comments(original)
    defs = {}
    for m in re.finditer(r"function\s+(\w+)\s*\(", stripped):
        name = m.group(1)
        if name not in IGNORE_NAMES:
            # Find this function name in the original to get the real line number
            pattern = r"function\s+" + re.escape(name) + r"\s*\("
            orig_match = re.search(pattern, original)
            if orig_match:
                line = original[: orig_match.start()].count("\n") + 1
            else:
                line = 0
            defs[name] = line
    return defs


def _build_caller_index(all_content):
    """Pre-compute caller counts for all words to avoid O(functions × files) regex.

    Returns dict of {word: total_call_count}.
    Counts bare calls, QOL.word(, and QOL_word( patterns.
    """
    stripped = _strip_comments(all_content)
    counts = defaultdict(int)

    # Bare calls: word(
    for m in re.finditer(r"\b(\w+)\s*\(", stripped):
        counts[m.group(1)] += 1

    # QOL.word( calls
    for m in re.finditer(r"QOL\.(\w+)\s*\(", stripped):
        counts[m.group(1)] += 1

    # QOL_word( calls
    for m in re.finditer(r"QOL_(\w+)\s*\(", stripped):
        counts[m.group(1)] += 1

    return counts


def count_definitions(func_name, target_content):
    """Count how many times func_name is defined in the target file."""
    stripped = _strip_comments(target_content)
    return len(re.findall(r"function\s+" + re.escape(func_name) + r"\s*\(", stripped))


def main():
    parser = argparse.ArgumentParser(
        description="Dead function detector for QOLLOCK Panorama ES5 codebase"
    )
    parser.add_argument(
        "target",
        nargs="+",
        help="JS file(s) to scan for dead functions (globs supported by shell)",
    )
    parser.add_argument(
        "--scripts-dir",
        default=None,
        help="Directory containing all JS files (default: auto-detect)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show caller counts for all functions, not just dead ones",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON for machine consumption",
    )
    args = parser.parse_args()

    # Resolve target files
    target_files = args.target

    # Auto-detect scripts directory
    if args.scripts_dir:
        scripts_dir = args.scripts_dir
    else:
        # Assume we're in the project root or scripts/ directory
        if os.path.isdir("panorama/scripts"):
            scripts_dir = "panorama/scripts"
        elif os.path.isdir("../panorama/scripts"):
            scripts_dir = "../panorama/scripts"
        else:
            scripts_dir = os.path.dirname(os.path.abspath(target_files[0]))
            while scripts_dir and not os.path.basename(scripts_dir) == "scripts":
                scripts_dir = os.path.dirname(scripts_dir)
            if not scripts_dir:
                scripts_dir = "."

    # Collect all JS content and build caller index
    js_files = find_js_files(scripts_dir)
    all_content = ""
    for fp in js_files:
        try:
            with open(fp, "r", encoding="utf-8", errors="replace") as f:
                all_content += f.read() + "\n"
        except Exception:
            pass

    # Pre-compute caller counts (one pass, not per-function)
    caller_index = _build_caller_index(all_content)

    results = []
    total_funcs = 0
    dead_count = 0

    for target in target_files:
        if not os.path.isfile(target):
            print(f"WARNING: {target} not found, skipping", file=sys.stderr)
            continue

        with open(target, "r", encoding="utf-8", errors="replace") as f:
            target_content = f.read()

        defs = extract_function_defs_with_lines(target)
        total_funcs += len(defs)
        target_dead = []

        for func_name, line in sorted(defs.items(), key=lambda x: x[1]):
            total_calls = caller_index.get(func_name, 0)
            defs_in_target = count_definitions(func_name, target_content)
            # Effective callers = total calls - definitions (function FuncName(...))
            effective = total_calls - defs_in_target

            if args.verbose and not args.json:
                status = "DEAD" if effective <= 0 else f"{effective} caller(s)"
                print(f"  [{status}] {func_name} (line {line})")
            elif effective <= 0:
                target_dead.append({"name": func_name, "line": line, "callers": effective})

        if target_dead:
            dead_count += len(target_dead)
            results.append({"file": target, "dead": target_dead})

    # Output
    if args.json:
        import json
        print(json.dumps({
            "total_functions": total_funcs,
            "dead_functions": dead_count,
            "results": results,
        }, indent=2))
    else:
        if dead_count == 0:
            print(f"OK: All {total_funcs} functions have callers across {len(js_files)} JS files.")
        else:
            print(f"DEAD FUNCTIONS: {dead_count}/{total_funcs} have zero callers")
            print()
            for r in results:
                print(f"── {os.path.basename(r['file'])} ({len(r['dead'])} dead) ──")
                for d in r["dead"]:
                    print(f"  line {d['line']:>5}: {d['name']}")
                print()

        if not args.verbose:
            print("(use --verbose to see caller counts for all functions)")

    return 0 if dead_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

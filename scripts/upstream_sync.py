"""Prepare reviewed native resource updates without losing unresolved overrides."""

import argparse
import base64
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

try:
    from native_xml_merge import merge_text, merge_xml
except ModuleNotFoundError:
    from scripts.native_xml_merge import merge_text, merge_xml

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "upstream.json"
PREFIX = "game/citadel/pak01_dir/panorama/"
REPOSITORY = "SteamTracking/GameTracking-Deadlock"
STYLE_VALIDATOR = Path(__file__).with_name("validate_panorama_styles.js")


def validate_css(data):
    code = "const fs=require('node:fs');const issues=require(process.argv[1]).scanSource(fs.readFileSync(0,'utf8'));" \
           "process.stdout.write(JSON.stringify(issues));process.exitCode=issues.length?1:0;"
    result = subprocess.run(["node", "-e", code, str(STYLE_VALIDATOR.resolve())],
                            input=data, capture_output=True, timeout=30)
    if result.returncode:
        issues = json.loads(result.stdout) if result.stdout else []
        raise ValueError("CSS source validation failed: " + "; ".join(item["message"] for item in issues))


def git_blob(data):
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def local_digest(data):
    return hashlib.sha256(data.replace(b"\r\n", b"\n")).hexdigest()


def api(path):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "QOLLOCK-Upstream"}
    if os.environ.get("GH_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["GH_TOKEN"]
    request = urllib.request.Request(f"https://api.github.com/repos/{REPOSITORY}/{path}", headers=headers)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
        except (http.client.IncompleteRead, urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
        time.sleep(2 ** attempt)


def native_index(sha):
    tree = api(f"git/trees/{sha}")
    for name in ("game", "citadel", "pak01_dir", "panorama"):
        entry = next(item for item in tree["tree"] if item["path"] == name and item["type"] == "tree")
        tree = api("git/trees/" + entry["sha"])
    result = {}
    for name in ("layout", "styles"):
        entry = next(item for item in tree["tree"] if item["path"] == name and item["type"] == "tree")
        subtree = api("git/trees/" + entry["sha"] + "?recursive=1")
        if subtree.get("truncated"):
            raise ValueError("Native resource listing is incomplete; no updates applied")
        result.update({f"{name}/{item['path']}": item["sha"]
                       for item in subtree["tree"] if item["type"] == "blob"})
    return result


def read_blob(sha):
    blob = api("git/blobs/" + sha)
    if blob.get("encoding") != "base64":
        raise ValueError("Unsupported native blob encoding")
    data = base64.b64decode(blob["content"], validate=False)
    if git_blob(data) != sha:
        raise ValueError("Native blob identity mismatch")
    return data


def normalized(data):
    text = data.decode("utf-8-sig").replace("\r\n", "\n")
    text = re.sub(r"^/\* Prettified by Source 2 Viewer[^\n]*\*/\s*", "", text)
    # Ignore blank-line-only Viewer changes, preserving multiline string contents.
    lines, quote, escaped = [], None, False
    for line in text.strip().splitlines():
        starts_in_string = quote
        for char in line:
            if escaped:
                escaped = False
            elif char == "\\" and quote:
                escaped = True
            elif quote and char == quote:
                quote = None
            elif not quote and char in "\"'":
                quote = char
        if line.strip() or starts_in_string:
            lines.append(line if starts_in_string or quote else line.rstrip())
    return "\n".join(lines)


def initialize(source):
    sha = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
    entries = {}
    targets = [(path, "styles/" + path.relative_to(ROOT / "panorama/styles/base").as_posix(), "css")
               for path in sorted((ROOT / "panorama/styles/base").rglob("*.css"))]
    targets += [(path, "layout/" + path.relative_to(ROOT / "panorama/layout").as_posix(), "xml")
                for path in sorted((ROOT / "panorama/layout").rglob("*.xml"))]
    for destination, upstream, kind in targets:
        # Use committed bytes, not a potentially modified local extract.
        read = subprocess.run(["git", "-C", str(source), "show", f"{sha}:{PREFIX}{upstream}"],
                              capture_output=True, check=False)
        data = read.stdout if read.returncode == 0 else None
        local = destination.read_bytes()
        entries[upstream] = {"blob": git_blob(data) if data is not None else None,
                             "destination": destination.relative_to(ROOT).as_posix(),
                             "kind": kind,
                             "auto_sync": kind == "css" and data is not None and normalized(data) == normalized(local),
                             "local_sha256": local_digest(local)}
    return {"repository": REPOSITORY, "commit": sha, "files": entries}


def plan(manifest, index, reader, root, accept_reviews=()):
    changes, writes = [], {}
    updated = json.loads(json.dumps(manifest))
    contents = {}
    for relative, entry in manifest["files"].items():
        old_sha, new_sha = entry["blob"], index.get(relative)
        if old_sha == new_sha and "pending_blob" not in entry:
            continue
        old = reader(old_sha) if old_sha else b""
        new = reader(new_sha) if new_sha else b""
        destination = root / entry["destination"]
        local = destination.read_bytes() if destination.is_file() else None
        next_entry = updated["files"][relative]
        next_entry.setdefault("base_commit", manifest.get("commit"))
        candidate, reason, status = None, "", "manual review"
        if local is None:
            reason = "local override is missing; retire or restore its manifest entry"
        elif relative in accept_reviews:
            if entry["kind"] == "xml":
                ET.fromstring(local)
            elif entry["kind"] == "css":
                validate_css(local)
            candidate, status = local, "review accepted"
        elif old_sha == new_sha:
            candidate, status = local, "upstream reverted"
        elif new_sha is None:
            reason = "removed upstream; compatibility review required"
        elif entry["kind"] == "css":
            try:
                if normalized(local) in (normalized(old), normalized(new)):
                    candidate, status = new, "updated"
                elif old_sha:
                    # Preserve local repairs/extensions while carrying disjoint native changes.
                    candidate = merge_text(local.decode("utf-8-sig").replace("\r\n", "\n"),
                                           old.decode("utf-8-sig").replace("\r\n", "\n"),
                                           new.decode("utf-8-sig").replace("\r\n", "\n")).encode("utf-8")
                    status = "CSS merged"
                else:
                    raise ValueError("no native CSS merge base")
                validate_css(candidate)
            except ValueError as error:
                candidate, status, reason = None, "manual review", str(error)
        elif entry["kind"] == "xml" and old_sha:
            try:
                candidate = merge_xml(local.decode("utf-8-sig"), old.decode("utf-8-sig"),
                                      new.decode("utf-8-sig")).encode("utf-8")
                status = "XML merged; client check required"
            except (ValueError, ET.ParseError) as error:
                reason = str(error)
        else:
            reason = "no native merge base; compatibility review required"
        changes.append({"path": relative, "kind": entry["kind"], "status": status,
                        "removed": new_sha is None, "reason": reason})
        contents[relative] = (old, new)
        if candidate is not None:
            if candidate != local:
                writes[entry["destination"]] = candidate
            next_entry.update(blob=new_sha, local_sha256=local_digest(candidate))
            if old_sha != new_sha:
                next_entry["base_commit"] = None  # Filled with the requested commit by synchronize.
            if entry["kind"] == "css":
                next_entry["auto_sync"] = normalized(candidate) == normalized(new)
            for key in ("pending_blob", "pending_local_sha256"):
                next_entry.pop(key, None)
        else:
            # blob remains the applied/reviewed base, including across later updates.
            next_entry["pending_blob"] = new_sha
            next_entry["pending_local_sha256"] = local_digest(local) if local is not None else None
            if entry["kind"] == "css":
                next_entry["auto_sync"] = False
    return changes, writes, updated, contents


def report(manifest, sha, changes):
    lines = ["# Native resource update", "",
             f"Upstream: `{manifest['commit']}` -> `{sha}`", "",
             "Only tracked native resources are included. XML merges preserve mod edits and require client checks.", "",
             "| File | Action | Details |", "| --- | --- | --- |"]
    lines += [f"| [`{item['path']}`](https://github.com/{REPOSITORY}/blob/{sha}/{PREFIX}{item['path']}) | "
              f"{item['status']} | {item['reason'].replace('|', '/').replace(chr(10), ' ')} |"
              for item in changes]
    lines += ["", "Review XML changes and any unsynchronized CSS before merging.",
              "A source update is not proof of client compatibility; compile/repack and test in game."]
    return "\n".join(lines) + "\n"


def fingerprint(entries):
    values = {path: {"blob": entry.get("pending_blob", entry["blob"]),
                     "pending": "pending_blob" in entry,
                     "local": entry.get("pending_local_sha256", entry["local_sha256"])}
              for path, entry in entries.items()}
    return hashlib.sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()


def synchronize(sha, output, dry_run=False, accept_reviews=()):
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest["repository"] != REPOSITORY:
        raise ValueError("Unexpected upstream repository")
    sha = sha or api("commits/master")["sha"]
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Expected a complete upstream commit SHA")
    unknown = set(accept_reviews) - manifest["files"].keys()
    if unknown:
        raise ValueError("Unknown review paths: " + ", ".join(sorted(unknown)))
    changes, writes, updated, _ = plan(manifest, native_index(sha), read_blob, ROOT, accept_reviews)
    for entry in updated["files"].values():
        if "base_commit" in entry and entry["base_commit"] is None:
            entry["base_commit"] = sha
    output.mkdir(parents=True, exist_ok=True)
    identity = fingerprint(updated["files"])
    summary = {"changed": bool(changes), "upstream_sha": sha, "fingerprint": identity, "changes": changes}
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    if not changes:
        return summary
    text = report(manifest, sha, changes)
    (output / "report.md").write_text(text, encoding="utf-8")
    if dry_run:
        return summary
    # Prepare every input and report before touching tracked sources.
    for destination, data in writes.items():
        (ROOT / destination).write_bytes(data)
    updated["commit"] = sha
    updated["fingerprint"] = identity
    MANIFEST.write_text(json.dumps(updated, indent=2) + "\n", encoding="utf-8")
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--initialize", type=Path, help="Seed upstream.json from a local committed extract")
    parser.add_argument("--sha", default="")
    parser.add_argument("--output", type=Path, default=ROOT / ".upstream-review")
    parser.add_argument("--dry-run", action="store_true", help="Write review artifacts without changing tracked sources")
    parser.add_argument("--accept-review", action="append", default=[], metavar="NATIVE_PATH",
                        help="Acknowledge a manually resolved override at the requested upstream revision")
    args = parser.parse_args()
    if args.initialize:
        if MANIFEST.exists():
            raise ValueError("An upstream baseline already exists")
        MANIFEST.write_text(json.dumps(initialize(args.initialize), indent=2) + "\n", encoding="utf-8")
        return
    summary = synchronize(args.sha, args.output, args.dry_run, args.accept_review)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as outputs:
            outputs.write(f"changed={str(summary['changed']).lower()}\n")
            outputs.write(f"upstream_sha={summary['upstream_sha']}\n")
            outputs.write(f"fingerprint={summary['fingerprint']}\n")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()

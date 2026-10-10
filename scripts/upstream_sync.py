"""Review changes to QOLLOCK's pinned native resources without rewriting XML."""

import argparse
import base64
import difflib
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
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "upstream.json"
PREFIX = "game/citadel/pak01_dir/panorama/"
REPOSITORY = "SteamTracking/GameTracking-Deadlock"


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
    return "\n".join(line.rstrip() for line in text.strip().splitlines())


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


def plan(manifest, index, reader, root):
    changes, writes = [], {}
    updated = json.loads(json.dumps(manifest))
    contents = {}
    for relative, entry in manifest["files"].items():
        old_sha, new_sha = entry["blob"], index.get(relative)
        if old_sha == new_sha:
            continue
        old = reader(old_sha) if old_sha else b""
        new = reader(new_sha) if new_sha else b""
        destination = root / entry["destination"]
        local = destination.read_bytes()
        can_sync = (entry["kind"] == "css" and entry["auto_sync"] and new_sha is not None
                    and local_digest(local) == entry["local_sha256"])
        status = "updated" if can_sync else "manual review"
        changes.append({"path": relative, "kind": entry["kind"], "status": status,
                        "removed": new_sha is None})
        contents[relative] = (old, new)
        if can_sync:
            writes[entry["destination"]] = new
            updated["files"][relative]["local_sha256"] = local_digest(new)
        updated["files"][relative]["blob"] = new_sha
        if entry["kind"] == "css" and not can_sync:
            updated["files"][relative]["auto_sync"] = False
    return changes, writes, updated, contents


def report(manifest, sha, changes):
    lines = ["# Native resource update", "",
             f"Upstream: `{manifest['commit']}` -> `{sha}`", "",
             "Only tracked native resources are included. XML overrides are not overwritten.", "",
             "| File | Action |", "| --- | --- |"]
    lines += [f"| `{item['path']}` | {item['status']}{' (removed upstream)' if item['removed'] else ''} |"
              for item in changes]
    lines += ["", "Review XML changes and any unsynchronized CSS before merging.",
              "A source update is not proof of client compatibility; compile/repack and test in game."]
    return "\n".join(lines) + "\n"


def fingerprint(entries):
    values = {path: entry["blob"] for path, entry in entries.items()}
    return hashlib.sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()


def synchronize(sha, output, dry_run=False):
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest["repository"] != REPOSITORY:
        raise ValueError("Unexpected upstream repository")
    sha = sha or api("commits/master")["sha"]
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Expected a complete upstream commit SHA")
    changes, writes, updated, contents = plan(manifest, native_index(sha), read_blob, ROOT)
    output.mkdir(parents=True, exist_ok=True)
    identity = fingerprint(updated["files"])
    summary = {"changed": bool(changes), "upstream_sha": sha, "fingerprint": identity, "changes": changes}
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    if not changes:
        return summary
    text = report(manifest, sha, changes)
    (output / "report.md").write_text(text, encoding="utf-8")
    with zipfile.ZipFile(output / "changed-resources.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("report.md", text)
        for relative, (old, new) in contents.items():
            if old:
                archive.writestr("before/" + relative, old)
            if new:
                archive.writestr("after/" + relative, new)
            diff = difflib.unified_diff(old.decode("utf-8-sig").splitlines(True),
                                        new.decode("utf-8-sig").splitlines(True),
                                        fromfile="before/" + relative, tofile="after/" + relative)
            archive.writestr("diff/" + relative + ".patch", "".join(diff))
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
    args = parser.parse_args()
    if args.initialize:
        if MANIFEST.exists():
            raise ValueError("An upstream baseline already exists")
        MANIFEST.write_text(json.dumps(initialize(args.initialize), indent=2) + "\n", encoding="utf-8")
        return
    summary = synchronize(args.sha, args.output, args.dry_run)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as outputs:
            outputs.write(f"changed={str(summary['changed']).lower()}\n")
            outputs.write(f"upstream_sha={summary['upstream_sha']}\n")
            outputs.write(f"fingerprint={summary['fingerprint']}\n")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()

"""Validate a maintainer-built ZIP without extracting or repacking its VPK."""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import struct
import zipfile


def validate(archive, version):
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Expected a three-part package version")
    expected = "QOL-Lock-" + version.replace(".", "") + ".zip"
    if archive.name != expected:
        raise ValueError(f"Expected archive name {expected}")
    with zipfile.ZipFile(archive) as package:
        files = [entry for entry in package.infolist() if not entry.is_dir()]
        if len({entry.filename for entry in files}) != len(files):
            raise ValueError("Duplicate archive entries")
        for entry in files:
            path = PurePosixPath(entry.filename)
            if path.is_absolute() or ".." in path.parts or "\\" in entry.filename or ":" in entry.filename:
                raise ValueError("Unsafe archive path")
            if (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("Symbolic links are not supported")
        vpks = [entry for entry in files if entry.filename.lower().endswith(".vpk")]
        if not vpks:
            raise ValueError("Archive does not contain a VPK")
        directories = [entry for entry in vpks if entry.filename.lower().endswith("_dir.vpk")]
        headers = directories or vpks
        for entry in headers:
            with package.open(entry) as vpk:
                header = vpk.read(12)
            if len(header) != 12:
                raise ValueError("Truncated VPK header")
            magic, format_version, _ = struct.unpack("<III", header)
            if magic != 0x55AA1234 or format_version not in (1, 2):
                raise ValueError("Invalid VPK header")
        broken = package.testzip()
        if broken:
            raise ValueError("Corrupted ZIP entry: " + broken)
    digest = hashlib.sha256()
    with archive.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return {"archive": archive.name, "sha256": digest.hexdigest(), "version": version,
            "vpk_files": [entry.filename for entry in vpks]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--package", type=Path, default=Path("package.json"))
    args = parser.parse_args()
    version = json.loads(args.package.read_text(encoding="utf-8"))["version"]
    print(json.dumps(validate(args.archive, version), indent=2))

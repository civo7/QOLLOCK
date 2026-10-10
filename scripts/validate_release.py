"""Package or validate a release without extracting or repacking its VPKs."""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import struct
import zipfile


def package_vpks(source, output, root):
    version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Expected a three-part package version")
    vpks = sorted(source.glob("*.vpk"))
    if not vpks or any(not path.is_file() or path.is_symlink() for path in vpks):
        raise ValueError("Expected regular maintainer-built VPK files")
    notices = [root / name for name in ("LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md")]
    if any(not path.is_file() for path in notices):
        raise ValueError("Missing distribution notices")
    output.mkdir(parents=True, exist_ok=True)
    archive = output / ("QOL-Lock-" + version.replace(".", "") + ".zip")
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED) as package:
        for path in vpks + notices:
            package.write(path, path.name)
    return validate(archive, version)


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
    parser.add_argument("archive", type=Path, nargs="?")
    parser.add_argument("--package", type=Path, default=Path("package.json"))
    parser.add_argument("--vpks", type=Path, help="Directory containing the prepared VPKs")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.vpks:
        if args.archive or not args.output:
            parser.error("--vpks requires --output and cannot be combined with an archive")
        print(json.dumps(package_vpks(args.vpks, args.output, args.package.resolve().parent), indent=2))
        parser.exit()
    if not args.archive or args.output:
        parser.error("Provide an archive, or --vpks with --output")
    version = json.loads(args.package.read_text(encoding="utf-8"))["version"]
    print(json.dumps(validate(args.archive, version), indent=2))

"""Exercise ZIP packaging with ordinary text fixtures, never creating VPKs."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
POWERSHELL = shutil.which("powershell") or shutil.which("pwsh")


@unittest.skipUnless(POWERSHELL, "PowerShell is required")
class BuildReleaseTests(unittest.TestCase):
    def package(self, root):
        command = """
            $ErrorActionPreference = 'Stop'
            . (Join-Path $env:RELEASE_REPO 'build_mod/build_mod_helpers.ps1')
            New-ReleaseArchive -SourceRoot $env:RELEASE_FIXTURE -OutputVpk (
                Join-Path $env:RELEASE_FIXTURE 'builds/payload.txt')
        """
        return subprocess.run([POWERSHELL, "-NoProfile", "-NonInteractive", "-Command", command],
                              env=dict(os.environ, RELEASE_REPO=str(ROOT), RELEASE_FIXTURE=str(root)),
                              capture_output=True, text=True, timeout=30)

    def fixture(self, root):
        (root / "builds").mkdir()
        (root / "builds/payload.txt").write_bytes(b"unchanged compiled payload fixture")
        (root / "builds/unrelated.txt").write_text("exclude me")
        (root / "package.json").write_text('{"version":"4.1.0"}')
        for name in ("LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"):
            (root / name).write_text("notice: " + name)

    def test_zip_contains_only_selected_payload_and_current_notices(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            result = self.package(root)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            archive = root / "builds/QOL-Lock-410.zip"
            with zipfile.ZipFile(archive) as package:
                self.assertEqual(set(package.namelist()), {
                    "payload.txt", "LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"})
                self.assertEqual(package.read("payload.txt"), b"unchanged compiled payload fixture")
                self.assertEqual(package.read("LICENSE"), b"notice: LICENSE")
            (root / "NOTICE").write_text("updated attribution")
            result = self.package(root)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            with zipfile.ZipFile(archive) as package:
                self.assertEqual(package.read("NOTICE"), b"updated attribution")

    def test_missing_notice_preserves_previous_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            archive = root / "builds/QOL-Lock-410.zip"
            archive.write_bytes(b"previous release")
            (root / "NOTICE").unlink()
            result = self.package(root)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("NOTICE", result.stderr)
            self.assertEqual(archive.read_bytes(), b"previous release")


if __name__ == "__main__":
    unittest.main()

import importlib.util
import http.client
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest
import urllib.error
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("upstream_sync", ROOT / "scripts/upstream_sync.py")
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)
release_spec = importlib.util.spec_from_file_location("validate_release", ROOT / "scripts/validate_release.py")
release = importlib.util.module_from_spec(release_spec)
release_spec.loader.exec_module(release)


class UpstreamReviewTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.old, self.new = b".Hud { opacity: 1; }\n", b".Hud { opacity: 0.9; }\n"
        self.blobs = {sync.git_blob(self.old): self.old, sync.git_blob(self.new): self.new}
        (self.root / "base.css").write_bytes(self.old)
        import hashlib
        self.entry = {"blob": sync.git_blob(self.old), "destination": "base.css", "kind": "css",
                      "auto_sync": True, "local_sha256": hashlib.sha256(self.old).hexdigest()}
        self.manifest = {"files": {"styles/base.css": self.entry}}

    def test_unrelated_dll_changes_do_not_create_a_review(self):
        changes, writes, _, _ = sync.plan(self.manifest,
            {"styles/base.css": sync.git_blob(self.old), "game/bin/server.dll": "new"}, self.blobs.__getitem__, self.root)
        self.assertEqual(changes, [])
        self.assertEqual(writes, {})

    def test_clean_baseline_can_be_updated(self):
        changes, writes, updated, _ = sync.plan(self.manifest,
            {"styles/base.css": sync.git_blob(self.new)}, self.blobs.__getitem__, self.root)
        self.assertEqual(changes[0]["status"], "updated")
        self.assertEqual(writes, {"base.css": self.new})
        self.assertEqual(updated["files"]["styles/base.css"]["blob"], sync.git_blob(self.new))

    def test_local_css_changes_require_manual_review(self):
        (self.root / "base.css").write_bytes(b"custom rule")
        changes, writes, updated, _ = sync.plan(self.manifest,
            {"styles/base.css": sync.git_blob(self.new)}, self.blobs.__getitem__, self.root)
        self.assertEqual(changes[0]["status"], "manual review")
        self.assertEqual(writes, {})
        self.assertFalse(updated["files"]["styles/base.css"]["auto_sync"])

    def test_xml_is_never_overwritten(self):
        self.entry["kind"] = "xml"
        changes, writes, _, _ = sync.plan(self.manifest,
            {"styles/base.css": sync.git_blob(self.new)}, self.blobs.__getitem__, self.root)
        self.assertEqual(changes[0]["status"], "manual review")
        self.assertEqual(writes, {})

    def test_removed_upstream_file_is_not_deleted_locally(self):
        changes, writes, _, _ = sync.plan(self.manifest, {}, self.blobs.__getitem__, self.root)
        self.assertTrue(changes[0]["removed"])
        self.assertEqual(writes, {})
        self.assertEqual((self.root / "base.css").read_bytes(), self.old)

    def test_identity_ignores_unrelated_commit_sha(self):
        self.assertEqual(sync.fingerprint(self.manifest["files"]),
                         sync.fingerprint(dict(reversed(list(self.manifest["files"].items())))))

    def test_checkout_line_endings_do_not_disable_automatic_sync(self):
        (self.root / "base.css").write_bytes(self.old.replace(b"\n", b"\r\n"))
        _, writes, _, _ = sync.plan(self.manifest,
            {"styles/base.css": sync.git_blob(self.new)}, self.blobs.__getitem__, self.root)
        self.assertEqual(writes, {"base.css": self.new})


    def test_dry_run_keeps_manifest_and_sources_unchanged(self):
        self.manifest.update(repository=sync.REPOSITORY, commit="b" * 40)
        manifest_path = self.root / "upstream.json"
        original = json.dumps(self.manifest).encode()
        manifest_path.write_bytes(original)
        output = self.root / "review"
        with patch.object(sync, "ROOT", self.root), patch.object(sync, "MANIFEST", manifest_path), \
                patch.object(sync, "native_index", return_value={"styles/base.css": sync.git_blob(self.new)}), \
                patch.object(sync, "read_blob", side_effect=self.blobs.__getitem__):
            summary = sync.synchronize("a" * 40, output, dry_run=True)
        self.assertTrue(summary["changed"])
        self.assertTrue((output / "changed-resources.zip").exists())
        self.assertEqual(manifest_path.read_bytes(), original)
        self.assertEqual((self.root / "base.css").read_bytes(), self.old)

    def test_incomplete_upstream_listing_is_rejected(self):
        def response(path):
            if "recursive=1" in path:
                return {"truncated": True, "tree": []}
            return {"tree": [{"path": name, "type": "tree", "sha": name}
                             for name in ("game", "citadel", "pak01_dir", "panorama", "layout", "styles")]}
        with patch.object(sync, "api", side_effect=response):
            with self.assertRaisesRegex(ValueError, "incomplete"):
                sync.native_index("a" * 40)


class UpstreamTransportTests(unittest.TestCase):
    def test_truncated_response_is_retried(self):
        with patch.object(sync.urllib.request, "urlopen") as request, patch.object(sync.time, "sleep") as sleep:
            request.side_effect = [http.client.IncompleteRead(b"partial", 10), request.return_value]
            request.return_value.__enter__.return_value = io.BytesIO(b'{"sha":"complete"}')
            self.assertEqual(sync.api("commits/master"), {"sha": "complete"})
            self.assertEqual(request.call_count, 2)
            sleep.assert_called_once_with(1)

    def test_authentication_errors_are_not_retried(self):
        error = urllib.error.HTTPError("https://api.github.com", 401, "Unauthorized", {}, None)
        self.addCleanup(error.close)
        with patch.object(sync.urllib.request, "urlopen", side_effect=error) as request, \
                patch.object(sync.time, "sleep") as sleep:
            with self.assertRaises(urllib.error.HTTPError):
                sync.api("commits/master")
            self.assertEqual(request.call_count, 1)
            sleep.assert_not_called()

    def test_transient_failures_stop_after_three_attempts(self):
        error = urllib.error.HTTPError("https://api.github.com", 503, "Unavailable", {}, None)
        self.addCleanup(error.close)
        with patch.object(sync.urllib.request, "urlopen", side_effect=error) as request, \
                patch.object(sync.time, "sleep") as sleep:
            with self.assertRaises(urllib.error.HTTPError):
                sync.api("commits/master")
            self.assertEqual(request.call_count, 3)
            self.assertEqual(sleep.call_count, 2)


class ReleaseArchiveTests(unittest.TestCase):
    def test_archive_name_must_match_package_version(self):
        with self.assertRaisesRegex(ValueError, "Expected archive name"):
            release.validate(Path("QOL-Lock-404.zip"), "4.0.5")

    def test_archive_without_a_vpk_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "QOL-Lock-405.zip"
            with zipfile.ZipFile(archive, "w") as package:
                package.writestr("README.txt", "not a mod")
            with self.assertRaisesRegex(ValueError, "does not contain a VPK"):
                release.validate(archive, "4.0.5")

    def test_header_validation_does_not_extract_or_modify_the_vpk(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "QOL-Lock-405.zip"
            archive.write_bytes(b"archive checksum fixture")
            with patch.object(release.zipfile, "ZipFile") as constructor:
                package = constructor.return_value.__enter__.return_value
                package.infolist.return_value = [zipfile.ZipInfo("pak99_dir.vpk")]
                package.open.return_value = io.BytesIO(struct.pack("<III", 0x55AA1234, 2, 0))
                package.testzip.return_value = None
                result = release.validate(archive, "4.0.5")
                self.assertEqual(result["vpk_files"], ["pak99_dir.vpk"])
                self.assertEqual(list(Path(directory).iterdir()), [archive])

    def test_invalid_vpk_header_is_rejected(self):
        with patch.object(release.zipfile, "ZipFile") as constructor:
            package = constructor.return_value.__enter__.return_value
            package.infolist.return_value = [zipfile.ZipInfo("pak99_dir.vpk")]
            package.open.return_value = io.BytesIO(b"invalid data")
            with self.assertRaisesRegex(ValueError, "Invalid VPK header"):
                release.validate(Path("QOL-Lock-405.zip"), "4.0.5")


if __name__ == "__main__":
    unittest.main()

import importlib.util
import http.client
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest
import urllib.error
from unittest.mock import MagicMock, patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("upstream_sync", ROOT / "scripts/upstream_sync.py")
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)
release_spec = importlib.util.spec_from_file_location("validate_release", ROOT / "scripts/validate_release.py")
release = importlib.util.module_from_spec(release_spec)
release_spec.loader.exec_module(release)
notify_spec = importlib.util.spec_from_file_location("notify_native_update", ROOT / "scripts/notify_native_update.py")
notify = importlib.util.module_from_spec(notify_spec)
notify_spec.loader.exec_module(notify)


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
        self.assertEqual(updated["files"]["styles/base.css"]["blob"], self.entry["blob"])
        self.assertEqual(updated["files"]["styles/base.css"]["pending_blob"], sync.git_blob(self.new))
        repeated, repeated_writes, _, _ = sync.plan(updated,
            {"styles/base.css": sync.git_blob(self.new)}, self.blobs.__getitem__, self.root)
        self.assertEqual(repeated[0]["status"], "manual review")
        self.assertEqual(repeated_writes, {})

    def test_formatting_only_base_can_recover_disabled_auto_sync(self):
        self.entry["auto_sync"] = False
        (self.root / "base.css").write_bytes(b"\n" + self.old + b"\n")
        _, writes, updated, _ = sync.plan(self.manifest,
            {"styles/base.css": sync.git_blob(self.new)}, self.blobs.__getitem__, self.root)
        self.assertEqual(writes, {"base.css": self.new})
        self.assertTrue(updated["files"]["styles/base.css"]["auto_sync"])

    def test_pending_removal_survives_and_acknowledgement_clears_it(self):
        changes, _, updated, _ = sync.plan(self.manifest, {}, self.blobs.__getitem__, self.root)
        self.assertTrue(changes[0]["removed"])
        repeated, _, _, _ = sync.plan(updated, {}, self.blobs.__getitem__, self.root)
        self.assertTrue(repeated[0]["removed"])
        _, _, resolved, _ = sync.plan(updated, {}, self.blobs.__getitem__, self.root, ["styles/base.css"])
        self.assertNotIn("pending_blob", resolved["files"]["styles/base.css"])
        self.assertIsNone(resolved["files"]["styles/base.css"]["blob"])

    def test_new_upstream_update_still_uses_last_applied_base(self):
        (self.root / "base.css").write_bytes(b"custom rule")
        _, _, pending, _ = sync.plan(self.manifest,
            {"styles/base.css": sync.git_blob(self.new)}, self.blobs.__getitem__, self.root)
        third = b".Hud { opacity: 0.8; }\n"
        self.blobs[sync.git_blob(third)] = third
        _, _, next_pending, contents = sync.plan(pending,
            {"styles/base.css": sync.git_blob(third)}, self.blobs.__getitem__, self.root)
        self.assertEqual(contents["styles/base.css"], (self.old, third))
        self.assertEqual(next_pending["files"]["styles/base.css"]["blob"], self.entry["blob"])

    def test_missing_local_override_becomes_pending(self):
        (self.root / "base.css").unlink()
        changes, writes, updated, _ = sync.plan(self.manifest,
            {"styles/base.css": sync.git_blob(self.new)}, self.blobs.__getitem__, self.root)
        self.assertIn("local override is missing", changes[0]["reason"])
        self.assertEqual(writes, {})
        self.assertIn("pending_blob", updated["files"]["styles/base.css"])

    def test_invalid_xml_is_never_overwritten(self):
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
        self.assertTrue((output / "report.md").exists())
        self.assertEqual({path.name for path in output.iterdir()}, {"report.md", "summary.json"})
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


class XmlMergeTests(unittest.TestCase):
    def test_disjoint_native_and_mod_children_survive(self):
        middle = '<Panel id="spacer" />\n' + ''.join(f'<Panel id="s{i}" />\n' for i in range(10))
        base = '<root>\n<Panel id="native" />\n' + middle + '</root>\n'
        local = base.replace('</root>', '<Panel id="mod" />\n</root>')
        native = base.replace('id="native"', 'id="native" class="updated"')
        result = sync.merge_xml(local, base, native)
        self.assertIn('id="mod"', result)
        self.assertIn('class="updated"', result)

    def test_clean_text_merge_cannot_change_mod_insertion_parent(self):
        middle = ''.join(f'<Panel id="s{i}" />\n' for i in range(10))
        base = '<root>\n<Panel id="anchor">\n' + middle + '</Panel>\n</root>\n'
        local = base.replace('</Panel>', '<Panel id="mod" />\n</Panel>')
        native = base.replace('id="anchor"', 'id="anchor" class="new-binding-context"')
        with self.assertRaisesRegex(ValueError, 'insertion parent changed'):
            sync.merge_xml(local, base, native)

    def test_moved_native_anchor_cannot_carry_mod_changes_silently(self):
        base = '<root><Panel id="anchor"><Label id="label" text="native" /></Panel></root>'
        local = base.replace('text="native"', 'text="mod"')
        native = '<root><Panel id="wrapper">' + base[6:-7] + '</Panel></root>'
        with self.assertRaises(ValueError):
            sync.merge_xml(local, base, native)

    def test_ambiguous_sibling_ids_are_rejected(self):
        source = '<root><Panel id="same" /><Panel id="same" /></root>'
        with self.assertRaisesRegex(ValueError, 'ambiguous'):
            sync.merge_xml(source, source, source)


class DeveloperNotificationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'summary.json').write_text(json.dumps({'changed': True, 'changes': [
            {'path': 'styles/hud.css'}]}))
        (self.root / 'pr-url.txt').write_text('https://github.com/civo7/QOLLOCK/pull/62')

    def test_json_notification_needs_no_archive_and_mentions_only_configured_role(self):
        with patch.dict(notify.os.environ, {'DISCORD_WEBHOOK_URL': 'https://discord.com/api/webhooks/1/token'}), \
                patch.object(notify, 'request_json', side_effect=[{'channel_id': notify.CHANNEL},
                    {'channel_id': notify.CHANNEL, 'id': 'ack'}]) as request:
            notify.send(self.root)
        url, payload = request.call_args.args
        self.assertIn('wait=true', url)
        self.assertIn(f'<@&{notify.ROLE}>', payload['content'])
        self.assertIn('/pull/62', payload['content'])
        self.assertEqual(payload['allowed_mentions'], {'parse': [], 'roles': [notify.ROLE]})
        self.assertNotIn('files', payload)

    def test_both_requests_use_explicit_user_agent_and_post_is_json(self):
        with patch.object(notify.urllib.request, 'urlopen') as request:
            request.return_value.__enter__.return_value = io.BytesIO(b'{}')
            notify.request_json('https://discord.com/api/webhooks/1/token', {'content': 'test'})
        sent = request.call_args.args[0]
        self.assertEqual(sent.get_header('User-agent'), notify.USER_AGENT)
        self.assertEqual(sent.get_header('Content-type'), 'application/json')
        self.assertEqual(json.loads(sent.data), {'content': 'test'})

    def test_http_failure_is_sanitized_and_never_acknowledged(self):
        secret_url = 'https://discord.com/api/webhooks/1/secret'
        error = urllib.error.HTTPError(secret_url, 403, 'Forbidden', {}, None)
        self.addCleanup(error.close)
        output = self.root / 'github-output'
        with patch.dict(notify.os.environ, {'DISCORD_WEBHOOK_URL': secret_url, 'GITHUB_OUTPUT': str(output)}), \
                patch.object(notify.urllib.request, 'urlopen', side_effect=error):
            with self.assertRaisesRegex(RuntimeError, 'HTTP 403') as raised:
                notify.send(self.root)
        self.assertNotIn('secret', str(raised.exception))
        self.assertFalse(output.exists())

    def test_wrong_channel_cannot_receive_message(self):
        with patch.dict(notify.os.environ, {'DISCORD_WEBHOOK_URL': 'https://discord.com/api/webhooks/1/token'}), \
                patch.object(notify, 'request_json', return_value={'channel_id': 'wrong'}) as request:
            with self.assertRaisesRegex(ValueError, 'channel'):
                notify.send(self.root)
        self.assertEqual(request.call_count, 1)


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
    def test_packaging_preserves_vpk_names_and_includes_notices(self):
        source, output, root = MagicMock(), MagicMock(), MagicMock()
        vpk = MagicMock()
        vpk.name = "QOLLOCK.vpk"
        vpk.is_file.return_value = True
        vpk.is_symlink.return_value = False
        source.glob.return_value = [vpk]
        (root / "package.json").read_text.return_value = '{"version":"4.0.5"}'
        with patch.object(release.zipfile, "ZipFile") as constructor, \
                patch.object(release, "validate", return_value={"version": "4.0.5"}) as validate:
            result = release.package_vpks(source, output, root)
        writes = constructor.return_value.__enter__.return_value.write.call_args_list
        self.assertEqual(writes[0].args, (vpk, "QOLLOCK.vpk"))
        self.assertEqual(len(writes), 4)
        validate.assert_called_once_with(output / "QOL-Lock-405.zip", "4.0.5")
        self.assertEqual(result["version"], "4.0.5")

    def test_packaging_rejects_missing_vpks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "package.json").write_text('{"version":"4.0.5"}')
            with self.assertRaisesRegex(ValueError, "maintainer-built VPK"):
                release.package_vpks(root, root / "out", root)
            self.assertFalse((root / "out").exists())

    def test_packaging_rejects_symlinked_vpks(self):
        source, output, root = MagicMock(), MagicMock(), MagicMock()
        source.glob.return_value = [MagicMock()]
        (root / "package.json").read_text.return_value = '{"version":"4.0.5"}'
        with self.assertRaisesRegex(ValueError, "maintainer-built VPK"):
            release.package_vpks(source, output, root)
        output.mkdir.assert_not_called()

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

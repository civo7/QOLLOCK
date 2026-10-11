# Releases and Native Resource Updates

## Publish a Prepared Release

The maintainer compiles, repacks and verifies QOLLOCK in Deadlock. CI publishes
the prepared VPKs inside a ZIP; it never builds or changes the VPKs.

1. Complete the [client checklist](TEST_CHECKLIST.md) for the intended source commit.
2. Choose the next public marker in [qollock-updates](https://github.com/Predi-i/qollock-updates)
   and set `QOL_UPDATE_MARKER` in `panorama/scripts/ql_update_checker.js` before building.
   Do not change package, schema or marker versions without maintainer authorization.
3. Compile/repack with `build_mod` and verify the resulting VPK in the client.
4. Create a tag such as `v4.0.5` for the exact source commit. Create a draft GitHub
   Release for that tag, write its release notes and upload the prepared `.vpk` files.
   For a split VPK, upload both the `_dir.vpk` and all numbered data archives.
5. In Actions, run **Publish prepared release** with that tag. This is the explicit
   publication step: the workflow runs `npm test`, packages all uploaded VPKs with
   `LICENSE`, `NOTICE` and `THIRD_PARTY_NOTICES.md`, checks ZIP integrity and VPK
   headers, uploads the ZIP, then publishes the existing draft. Package `4.0.5`
   produces `QOL-Lock-405.zip`; no manual ZIP preparation is needed.
   Preserve any additional applicable third-party notices with the distribution.
6. Run **Publish QOLLOCK update marker** in the public marker repository with the
   matching number and `Dry run` off. Confirm its successful completion and update
   the [GameBanana page](https://gamebanana.com/mods/updates/650634).

The marker is independent of the settings and package versions. It is embedded
before building but announced after the downloadable release exists. The workflow
does not alter or publish that marker automatically. ZIP validation does not prove
that its VPK was built from the tagged source; the maintainer verifies that pairing.
An already published release is rejected rather than silently replaced.

## Maintainer Build Tool

`build_mod/build_mod.bat` opens the standalone builder. Keep
`build_mod_helpers.ps1` beside `build_mod.ps1` when copying it. Its core is synced
from Deadlock-Mod-Compiler, with QOLLOCK's game-content roots restricted to
`panorama`, `soundevents` and `sounds`; root-level development scripts are excluded.

TTF fonts and supported precompiled resources are staged without compilation.
Changed or removed PNG/TGA inputs requeue texture descriptors, including custom
ones. Unsupported formats are reported rather than silently omitted.
This is not a general dependency graph for every Source 2 resource type.
Addon numbering uses real files and existing valid mod assignments, allocating
only `pak01` through `pak99`; stale registry entries do not reserve empty slots.

Packing happens separately from the current output. Replacement backs up the
previous bundle and attempts rollback on failure. If rollback also fails, its
backup is preserved and the error identifies its location. Split-file replacement
is not crash-atomic. The build tool remains maintainer-run.

Its isolated offline checks can be run without starting the builder or creating VPKs:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File build_mod/tests/build_mod_regression.ps1
```

## Review Upstream Changes

`upstream.json` records the GameTracking commit and native CSS/XML files used by
QOLLOCK. It is seeded from committed game resources, not a dirty local extract.
CSS replacement is allowed when the local source still matches the applied or
new native baseline, ignoring the Viewer header, line endings and blank-line-only
formatting changes. Disjoint custom CSS edits use three-way merging, retaining
local repairs/extensions. Every CSS candidate passes the existing source safety
scanner before being written; this does not verify native CSS grammar. Conflicts,
invalid source candidates and upstream deletions remain pending for manual review.

**Review native resource updates** runs hourly, on a manual request, or after a
`game-update` dispatch. It reads complete native Git trees and compares watched
blob IDs, so unrelated DLL changes and incomplete comparison pages cannot create
false-positive updates. An incomplete native listing fails without source writes.

For a local preview, run `python scripts/upstream_sync.py --dry-run`. It writes
the report and summary under `.upstream-review/` without changing the baseline
manifest or source files.
Manual Actions runs default to `dry_run`: they keep the review artifact but do
not push a branch, create a PR or notify Discord. Scheduled and Worker-triggered
runs use the normal review path.

For relevant changes, the workflow validates the sources and creates or updates
the bot-owned `codex/native-resource-update` branch and one review PR. It never
merges the PR. XML overrides use a three-way text merge followed by structural
checks that preserve native/mod edits and reject removed, moved, ambiguous or
changed insertion anchors. Successful merges are source proposals requiring
compile/repack and client checks. Conflicts remain listed in the review report;
upstream removals do not delete local files. No resource ZIP is generated.
Duplicate watched-file fingerprints are suppressed, even
when unrelated upstream commits arrive while a review is open.

`blob` is the applied/reviewed native base. Unresolved changes retain that base
and record `pending_blob` (including removals); they remain pending on subsequent
runs instead of being silently acknowledged. `base_commit` identifies the applied
revision for changed entries. After resolving a custom override, use
`python scripts/upstream_sync.py --sha <reviewed-commit> --accept-review <native-path>`
to acknowledge that specific file. Acknowledgement is an explicit compatibility
decision; parsing the XML is not client verification.

Keep manual fixes on a separate branch. The bot regenerates its own proposal but
refuses to replace a branch containing additional manual commits. Apply required
XML and CSS fixes, then compile/repack and verify in the client. The existing
[game-update audit](GAME_UPDATE_AUDIT.md) can provide additional ID/class evidence.

Enable **Allow GitHub Actions to create and approve pull requests** in repository
Actions settings for PR creation. This workflow runs its checks before pushing;
it does not rely on a bot push triggering the ordinary CI workflow.

## Developer Notifications

Configure the repository secret `DISCORD_DEV_WEBHOOK_URL` for developer channel
`1504149536891867207`. Do not commit or paste the webhook URL into documentation.
The sender checks the webhook channel and permits only role `1558343429077868645`
to be mentioned. It sends the PR URL and changed-file list as JSON, without
attachments, before/after snapshots or diffs. Both requests use an explicit HTTP
User-Agent. Without a webhook,
the PR and artifact remain available and the workflow reports delivery as skipped.
Delivery failure does not fail a successfully prepared source review and is not
marked acknowledged. A later scheduled run retries an unacknowledged notification;
the current Actions artifact contains only the report and summary. No live
notification is sent by offline tests.

To verify the configured secret and live Discord transport, run **Test Discord
developer webhook**. It uses the notification sender's HTTP helper, checks the
channel, sends one clearly identified test message with the developer role
mention and requires Discord's returned message ID/channel. It does not create
a PR or change game resources/releases.

## Optional Cloudflare Watcher

`tools/updater/worker.mjs` checks every ten minutes and triggers the same review
workflow when enabled. No secrets are stored in its configuration.
The checked-in config identifies the project account and its dedicated `STATE_KV`
namespace; those identifiers are not credentials. The project watcher is enabled
after the repository workflow and its GitHub credentials have been verified.
For a new deployment, first set `ENABLED` to `false` and configure the
Worker secret `GITHUB_PAT` with access to dispatch workflows/read the source
repository. Verify readiness, then set `ENABLED` to `true`.

Publish `upstream.json` and `native-update.yml` on the repository's default branch
before enabling the watcher. Its public status response exposes only readiness
flags, not credentials, and cannot start checks or dispatch workflows.
For an authenticated, read-only connection test, use remote Wrangler development
with `VERIFY_ONLY:true` and test its scheduled handler. This validates repository
access and published workflow/manifest availability without dispatching or
advancing the watcher's checkpoint.

The Worker reads the watched list from the repository's `upstream.json`, waits for
the corresponding workflow result before accepting a relevant update, and backs
off after failed reviews. Its public HTTP endpoint is read-only. Deployment is a
maintainer action; local source changes do not configure Cloudflare or GitHub secrets.

## Offline Checks

```sh
python -m unittest discover -s tests -p '*_automation_test.py'
node --test tests/updater_worker.test.mjs
npm test
```

These checks model source filtering and packaging rules. They do not publish a
release, create a PR, send a webhook, deploy a Worker or verify game rendering.

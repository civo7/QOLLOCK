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

## Review Upstream Changes

`upstream.json` records the GameTracking commit and native CSS/XML files used by
QOLLOCK. It is seeded from committed game resources, not a dirty local extract.
Automatic CSS replacement is enabled only for baseline copies that initially
match those resources. A local change or upstream deletion requires manual review.

**Review native resource updates** runs hourly, on a manual request, or after a
`game-update` dispatch. It reads complete native Git trees and compares watched
blob IDs, so unrelated DLL changes and incomplete comparison pages cannot create
false-positive updates. An incomplete native listing fails without source writes.

For a local preview, run `python scripts/upstream_sync.py --dry-run`. It writes
the report and bundle under `.upstream-review/` without changing the baseline
manifest or source files.
Manual Actions runs default to `dry_run`: they keep the review artifact but do
not push a branch, create a PR or notify Discord. Scheduled and Worker-triggered
runs use the normal review path.

For relevant changes, the workflow validates the sources and creates or updates
the bot-owned `codex/native-resource-update` branch and one review PR. It never
merges the PR. XML overrides are never replaced: the report and ZIP include the
old/new native resources and diffs for manual integration. Upstream removals do
not delete local files. Duplicate watched-file fingerprints are suppressed, even
when unrelated upstream commits arrive while a review is open.

Keep manual fixes on a separate branch; the bot replaces its own proposal branch.
Review the archive before accepting the baseline advancement, apply required XML
and CSS fixes, then compile/repack and verify in the client. The existing
[game-update audit](GAME_UPDATE_AUDIT.md) can provide additional ID/class evidence.

Enable **Allow GitHub Actions to create and approve pull requests** in repository
Actions settings for PR creation. This workflow runs its checks before pushing;
it does not rely on a bot push triggering the ordinary CI workflow.

## Developer Notifications

Configure the repository secret `DISCORD_DEV_WEBHOOK_URL` for developer channel
`1504149536891867207`. Do not commit or paste the webhook URL into documentation.
The sender checks the webhook channel and permits only role `1558343429077868645`
to be mentioned. It sends the PR URL and changed-resource ZIP. Large bundles link
to the Actions artifact instead of exceeding attachment limits. Without a webhook,
the PR and artifact remain available and the workflow reports delivery as skipped.
If a previous review exists but notification was not acknowledged, a retry keeps
the bundle in the current Actions run before attempting delivery again.

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

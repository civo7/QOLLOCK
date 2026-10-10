import assert from "node:assert/strict";
import { test } from "node:test";
import worker, { check, preflight } from "../tools/updater/worker.mjs";

const latest = "a".repeat(40);
const baseline = "b".repeat(40);
const manifest = { files: { "styles/hud.css": { blob: "old" } } };

function fixture(blob = "old", initial = {}) {
    let state = initial;
    let dispatches = 0;
    let failed = false;
    let pendingStatus = "in_progress";
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
        if (failed) return Response.json({}, { status: 500 });
        if (options.method === "POST") {
            dispatches++;
            return new Response(null, { status: 204 });
        }
        if (url.includes("contents/upstream.json")) return Response.json({ content: btoa(JSON.stringify(manifest)) });
        if (url.includes("commits/master")) return Response.json({ sha: latest });
        if (url.includes("actions/workflows/")) return Response.json({ workflow_runs: [{
            display_title: `QOLLOCK native update ${latest}`, created_at: new Date().toISOString(),
            status: pendingStatus, conclusion: "success"
        }] });
        if (url.includes("?recursive=1")) return Response.json({
            tree: url.includes("styles-tree") ? [{ type: "blob", path: "hud.css", sha: blob }] : []
        });
        return Response.json({ tree: ["game", "citadel", "pak01_dir", "panorama", "styles", "layout"]
            .map(path => ({ type: "tree", path, sha: path + "-tree" })) });
    };
    const env = { ENABLED: "true", GITHUB_PAT: "test", STATE_KV: {
        async get() { return structuredClone(state); },
        async put(key, value) { state = JSON.parse(value); }
    } };
    return { env, get state() { return state; }, get dispatches() { return dispatches; },
        fail() { failed = true; }, complete() { pendingStatus = "completed"; },
        restore() { globalThis.fetch = previousFetch; } };
}

test("unchanged watched files skip a new upstream commit containing unrelated changes", async t => {
    const data = fixture();
    t.after(() => data.restore());
    assert.equal((await check(data.env)).status, "unrelated-update");
    assert.equal(data.dispatches, 0);
    assert.equal(data.state.checked_sha, latest);
});

test("a native change dispatches once and accepts it only after the workflow succeeds", async t => {
    const data = fixture("new");
    t.after(() => data.restore());
    assert.equal((await check(data.env)).status, "dispatched");
    assert.equal(data.state.checked_sha, undefined);
    assert.equal((await check(data.env)).status, "waiting-for-review");
    assert.equal(data.dispatches, 1);
    data.complete();
    assert.equal((await check(data.env)).status, "unchanged");
    assert.equal(data.state.checked_sha, latest);
});

test("failed GitHub reads preserve the previous checkpoint", async t => {
    const data = fixture("new", { checked_sha: baseline });
    t.after(() => data.restore());
    data.fail();
    await assert.rejects(check(data.env), /GitHub returned 500/);
    assert.equal(data.state.checked_sha, baseline);
    assert.equal(data.dispatches, 0);
});

test("disabled config makes no external requests", async () => {
    assert.equal((await check({ ENABLED: "false" })).status, "disabled");
});

test("preflight validates GitHub access without dispatching or writing state", async t => {
    const previousFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = previousFetch; });
    globalThis.fetch = async (url, options = {}) => {
        assert.equal(options.method, undefined);
        if (url.endsWith("/QOLLOCK")) return Response.json({ permissions: { push: true } });
        if (url.includes("contents/upstream.json")) return Response.json({
            content: btoa(JSON.stringify({ ...manifest, repository: "SteamTracking/GameTracking-Deadlock" }))
        });
        return Response.json({ workflow_runs: [] });
    };
    const result = await preflight({ GITHUB_PAT: "test", STATE_KV: {
        put() { throw new Error("Preflight must not write state"); }
    } });
    assert.equal(result.status, "ready");
    assert.equal(result.watched_files, 1);
});

test("preflight rejects a GitHub account without repository write access", async t => {
    const previousFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = previousFetch; });
    globalThis.fetch = async () => Response.json({ permissions: { push: false } });
    await assert.rejects(preflight({ GITHUB_PAT: "test", STATE_KV: {} }), /cannot write/);
});

test("public status reports readiness without leaking credentials or dispatching", async t => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = () => { throw new Error("Status must not make external requests"); };
    t.after(() => { globalThis.fetch = previousFetch; });
    const response = await worker.fetch(new Request("https://example.com/force"), {
        ENABLED: "false", GITHUB_PAT: "private-token", STATE_KV: {}
    });
    const status = await response.json();
    assert.equal(status.enabled, false);
    assert.equal(status.configured, true);
    assert.equal(JSON.stringify(status).includes("private-token"), false);
    const unconfigured = await worker.fetch(new Request("https://example.com"), { ENABLED: "false" });
    assert.equal((await unconfigured.json()).configured, false);
});

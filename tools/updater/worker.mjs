const target = "civo7/QOLLOCK";
const upstream = "SteamTracking/GameTracking-Deadlock";
const stateKey = "QOLLOCK_NATIVE_WATCHER_V1";

async function github(repository, path, token, options = {}) {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
            "User-Agent": "QOLLOCK-Native-Watcher", ...options.headers }
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    return response.status === 204 ? null : response.json();
}

async function watchedIdentity(manifest, sha, token) {
    let tree = await github(upstream, `git/trees/${sha}`, token);
    for (const name of ["game", "citadel", "pak01_dir", "panorama"]) {
        const entry = tree.tree.find(item => item.path === name && item.type === "tree");
        if (!entry) throw new Error(`Missing native directory ${name}`);
        tree = await github(upstream, `git/trees/${entry.sha}`, token);
    }
    const files = {};
    for (const name of ["styles", "layout"]) {
        const entry = tree.tree.find(item => item.path === name && item.type === "tree");
        if (!entry) throw new Error(`Missing native directory ${name}`);
        const listing = await github(upstream, `git/trees/${entry.sha}?recursive=1`, token);
        if (listing.truncated) throw new Error("Incomplete native resource listing");
        for (const item of listing.tree) {
            if (item.type === "blob") files[`${name}/${item.path}`] = item.sha;
        }
    }
    return JSON.stringify(Object.keys(manifest.files).sort().map(path => [path, files[path] || null]));
}

export async function preflight(env) {
    if (!env.GITHUB_PAT || !env.STATE_KV) throw new Error("Configure GITHUB_PAT and STATE_KV");
    const token = env.GITHUB_PAT.trim();
    const repository = await github(target, "", token);
    if (!repository.permissions?.push) throw new Error("GitHub token cannot write to QOLLOCK");
    const manifestResponse = await github(target, "contents/upstream.json", token);
    const manifest = JSON.parse(atob(manifestResponse.content.replace(/\s/g, "")));
    if (manifest.repository !== upstream || !Object.keys(manifest.files || {}).length) {
        throw new Error("Invalid watched-resource manifest");
    }
    await github(target, "actions/workflows/native-update.yml/runs?per_page=1", token);
    return { status: "ready", repository: target, watched_files: Object.keys(manifest.files).length };
}

export async function check(env) {
    if (env.ENABLED !== "true") return { status: "disabled" };
    if (!env.GITHUB_PAT || !env.STATE_KV) throw new Error("Configure GITHUB_PAT and STATE_KV");
    const token = env.GITHUB_PAT.trim();
    const state = await env.STATE_KV.get(stateKey, "json") || {};
    if (state.retry_after && Date.now() < state.retry_after) return { status: "retry-later" };
    if (state.pending) {
        const runs = await github(target,
            "actions/workflows/native-update.yml/runs?event=repository_dispatch&per_page=100", token);
        const run = runs.workflow_runs.find(item => item.display_title === `QOLLOCK native update ${state.pending.sha}`
            && Date.parse(item.created_at) >= state.pending.created_at - 5000);
        if ((!run || run.status !== "completed") && Date.now() - state.pending.created_at < 3600000) {
            return { status: "waiting-for-review", sha: state.pending.sha };
        }
        if (!run || run.conclusion !== "success") {
            delete state.pending;
            state.retry_after = Date.now() + 3600000;
            await env.STATE_KV.put(stateKey, JSON.stringify(state));
            return { status: "review-failed", url: run?.html_url };
        }
        state.checked_sha = state.pending.sha;
        state.identity = state.pending.identity;
        delete state.pending;
        delete state.retry_after;
        await env.STATE_KV.put(stateKey, JSON.stringify(state));
    }
    const manifestResponse = await github(target, "contents/upstream.json", token);
    const manifest = JSON.parse(atob(manifestResponse.content.replace(/\s/g, "")));
    const latest = await github(upstream, "commits/master", token);
    if (!/^[0-9a-f]{40}$/.test(latest.sha)) throw new Error("Invalid upstream SHA");
    if (latest.sha === state.checked_sha) return { status: "unchanged" };
    const identity = await watchedIdentity(manifest, latest.sha, token);
    const previous = state.identity || JSON.stringify(Object.keys(manifest.files).sort()
        .map(path => [path, manifest.files[path].blob]));
    if (identity === previous) {
        state.checked_sha = latest.sha;
        state.identity = identity;
        await env.STATE_KV.put(stateKey, JSON.stringify(state));
        return { status: "unrelated-update" };
    }
    const started = Date.now();
    await github(target, "dispatches", token, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: "game-update", client_payload: { sha: latest.sha } })
    });
    state.pending = { sha: latest.sha, identity, created_at: started };
    await env.STATE_KV.put(stateKey, JSON.stringify(state));
    return { status: "dispatched", sha: latest.sha };
}

export default {
    async scheduled(event, env, context) {
        context.waitUntil((env.VERIFY_ONLY === "true" ? preflight(env) : check(env))
            .then(result => console.log(JSON.stringify(result))));
    },
    async fetch(request, env) {
        return Response.json({ name: "QOLLOCK native resource watcher", interval_minutes: 10,
            enabled: env.ENABLED === "true", configured: Boolean(env.GITHUB_PAT && env.STATE_KV) });
    }
};

// OWNS: Instance-local rolling display snapshots and per-entry alert throttling.
// DOES NOT OWN: Scheduler samples or native panels. Diagnostics are callback timings, not frame time.
(() => {
    "use strict";
    QOL.features.performanceModel = {
        create() {
            let snapshots = [], previousCount = -1, previousEntries = null;
            const alertTimes = new Map();
            function reset() { snapshots = []; previousCount = -1; previousEntries = null; alertTimes.clear(); }
            function capture(stats, now) {
                let count = 0;
                const entries = {};
                for (const [name, entry] of Object.entries(stats)) if (entry && entry.count > 0) {
                    count += entry.count;
                    entries[name] = { total: entry.total, count: entry.count, max: entry.max };
                }
                if (previousCount > 0 && count < previousCount && previousEntries) {
                    snapshots.push({ timeMs: now, entries: previousEntries });
                    while (snapshots.length > 12) snapshots.shift();
                }
                previousCount = count; previousEntries = Object.keys(entries).length ? entries : null;
                while (snapshots.length && snapshots[0].timeMs < now - 60000) snapshots.shift();
            }
            function merge(stats) {
                const merged = new Map();
                const add = (name, entry) => {
                    if (!entry || entry.count <= 0) return;
                    const previous = merged.get(name) || { name, total: 0, count: 0, max: 0 };
                    previous.total += entry.total; previous.count += entry.count;
                    previous.max = Math.max(previous.max, Number(entry.max) || 0);
                    merged.set(name, previous);
                };
                for (const snapshot of snapshots) for (const [name, entry] of Object.entries(snapshot.entries)) add(name, entry);
                for (const [name, entry] of Object.entries(stats)) add(name, entry);
                return [...merged.values()].sort((a, b) => b.total - a.total);
            }
            function line(entry, name = entry.name) {
                const short = name.length > 22 ? name.substring(0, 19) + "..." : name;
                return short + ": " + entry.total.toFixed(1) + "ms  avg " + (entry.total / entry.count).toFixed(1) +
                    "ms  max " + entry.max.toFixed(1) + "ms  n=" + entry.count;
            }
            function build(stats, now, threshold = 10) {
                capture(stats, now);
                const entries = merge(stats), alerts = [], lines = [];
                const names = new Set(entries.map(entry => entry.name));
                for (const name of alertTimes.keys()) if (!names.has(name)) alertTimes.delete(name);
                if (!entries.length) return { title: "Perf", body: "(no perf data)", alerts };
                for (const entry of entries.slice(0, 8)) {
                    lines.push(line(entry));
                    if (entry.max > threshold && now - (alertTimes.get(entry.name) || 0) >= 5000) {
                        alertTimes.set(entry.name, now);
                        alerts.push("[QOLLock][Perf] ALERT: " + entry.name + " spiked to " + entry.max.toFixed(1) +
                            "ms (threshold=" + threshold + "ms)");
                    }
                }
                const manifests = entries.filter(entry => entry.name.startsWith("mf."));
                if (manifests.length) {
                    lines.push("", "--- Manifests ---");
                    for (const entry of manifests.slice(0, 8)) lines.push(line(entry, entry.name.substring(3)));
                }
                let title = "Perf  (" + entries[0].total.toFixed(1) + "ms total";
                if (snapshots.length) title += ", " + Math.min(60, Math.round((now - snapshots[0].timeMs) / 1000)) + "s";
                return { title: title + ")", body: lines.join("\n"), alerts };
            }
            return { build, reset };
        }
    };
})();

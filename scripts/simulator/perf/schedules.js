"use strict";

// Offline only. Install before loading scripts so raw $.Schedule chains in any
// sandbox context are visible, including code outside the managed Scheduler.
function installScheduleProbe(sandbox) {
    const $ = sandbox.global.$;
    const schedule = $.Schedule;
    const cancel = $.CancelScheduled;
    const pending = new Map();
    const rows = new Map();
    let currentOrigin = "";
    function origin() {
        const stack = String(new Error().stack).replace(/\\/g, "/").split("\n");
        const frames = stack.filter(line => line.includes("panorama/scripts/"));
        const manifest = frames.find(line => line.includes("/manifests/"));
        if (!manifest && currentOrigin) return currentOrigin;
        const frame = manifest || frames[0];
        return frame ? frame.slice(frame.indexOf("panorama/scripts/")).replace(/\)$/, "") : "<harness>";
    }
    function rowFor(id) {
        if (!rows.has(id)) rows.set(id, { origin: id, scheduled: 0, fired: 0, cancelled: 0, errors: 0, pending: 0, peak: 0 });
        return rows.get(id);
    }
    $.Schedule = (delay, callback) => {
        if (typeof callback !== "function") return schedule(delay, callback);
        const row = rowFor(origin());
        let handle;
        handle = schedule(delay, function (...args) {
            pending.delete(handle);
            row.pending--;
            row.fired++;
            const previous = currentOrigin;
            currentOrigin = row.origin;
            try { return callback.apply(this, args); }
            catch (error) { row.errors++; throw error; }
            finally { currentOrigin = previous; }
        });
        pending.set(handle, row);
        row.scheduled++;
        row.pending++;
        row.peak = Math.max(row.peak, row.pending);
        return handle;
    };
    $.CancelScheduled = handle => {
        const row = pending.get(handle);
        if (row) {
            row.pending--;
            row.cancelled++;
            pending.delete(handle);
        }
        return cancel(handle);
    };
    return {
        snapshot() { return Array.from(rows.values(), row => ({ ...row })); },
        resetWindow() {
            for (const row of rows.values()) {
                row.scheduled = row.fired = row.cancelled = row.errors = 0;
                row.peak = row.pending;
            }
        }
    };
}

module.exports = { installScheduleProbe };

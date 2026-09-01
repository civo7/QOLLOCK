// scripts/simulator/clock.js
// =============================================================================
// Virtual clock for the Panorama simulator.
// =============================================================================
// Every source of "now" inside the sandbox reads from one Clock instance:
//   - Date.now() and new Date()      (via makeVirtualDate)
//   - performance.now()
//   - $.FrameTime()                  (seconds, not ms)
//   - $.Schedule(sec, cb)            (the mechanism every poll loop uses)
//
// Determinism: events are ordered by (at, seq). `seq` is a monotonic counter so
// two callbacks scheduled for the same virtual ms fire in scheduling order.
// Callbacks may schedule further callbacks; advance() keeps draining until the
// queue has nothing left at or before the target time.
// =============================================================================

"use strict";

// A poll loop reschedules itself forever, so advance() must be bounded or a
// buggy loop with a 0ms delay would spin here instead of failing the test.
const DEFAULT_MAX_STEPS = 200000;

class Clock {
    constructor(startMs = 0) {
        this._now = startMs;
        this._seq = 0;
        this._queue = []; // sorted ascending by (at, seq)
        this._cancelled = new Set();
        this.stats = { scheduled: 0, fired: 0, cancelled: 0, errors: 0 };
        // Callback errors are collected rather than thrown, because Panorama
        // swallows exceptions inside $.Schedule callbacks too. Tests assert on
        // this array so a silently-throwing poll loop cannot pass unnoticed.
        this.errors = [];
    }

    now() {
        return this._now;
    }

    nowSeconds() {
        return this._now / 1000;
    }

    /**
     * Schedule `cb` to run `delaySec` seconds of virtual time from now.
     * Returns an opaque handle usable with cancel().
     */
    schedule(delaySec, cb) {
        if (typeof cb !== "function") return 0;
        const delayMs = Math.max(0, Number(delaySec) * 1000);
        if (!Number.isFinite(delayMs)) return 0;

        const handle = ++this._seq;
        const event = { at: this._now + delayMs, seq: handle, cb };

        // Insertion sort from the tail: schedules are overwhelmingly in the
        // future relative to existing entries, so this is near-O(1) in practice
        // and avoids pulling in a heap implementation.
        let i = this._queue.length - 1;
        while (i >= 0 && this._isAfter(this._queue[i], event)) i--;
        this._queue.splice(i + 1, 0, event);

        this.stats.scheduled++;
        return handle;
    }

    cancel(handle) {
        if (!handle) return;
        const idx = this._queue.findIndex((e) => e.seq === handle);
        if (idx >= 0) {
            this._queue.splice(idx, 1);
            this.stats.cancelled++;
            return;
        }
        // Cancelling an already-fired or not-yet-known handle is legal in
        // Panorama; remember it so a re-entrant schedule can't resurrect it.
        this._cancelled.add(handle);
    }

    _isAfter(a, b) {
        return a.at > b.at || (a.at === b.at && a.seq > b.seq);
    }

    /**
     * Advance virtual time by `ms`, firing every callback due in that window.
     * Time moves to each event's timestamp before its callback runs, so code
     * reading Date.now() inside a callback sees the time it was scheduled for.
     */
    advance(ms, maxSteps = DEFAULT_MAX_STEPS) {
        const target = this._now + Math.max(0, Number(ms) || 0);
        let steps = 0;

        while (this._queue.length > 0 && this._queue[0].at <= target) {
            if (++steps > maxSteps) {
                throw new Error(
                    `[Clock] livelock: ${maxSteps} callbacks fired without reaching ` +
                    `target ${target}ms (now ${this._now}ms, ${this._queue.length} queued). ` +
                    `A poll loop is probably scheduling with ~0 delay.`
                );
            }

            const event = this._queue.shift();
            if (this._cancelled.has(event.seq)) {
                this._cancelled.delete(event.seq);
                continue;
            }

            this._now = event.at;
            this.stats.fired++;
            try {
                event.cb();
            } catch (err) {
                this.stats.errors++;
                this.errors.push({ at: this._now, error: err });
            }
        }

        this._now = target;
        return this;
    }

    /** Advance in `stepMs` slices — use when a test wants to poll between ticks. */
    advanceBy(totalMs, stepMs, onStep) {
        let elapsed = 0;
        while (elapsed < totalMs) {
            const slice = Math.min(stepMs, totalMs - elapsed);
            this.advance(slice);
            elapsed += slice;
            if (typeof onStep === "function" && onStep(this._now) === false) break;
        }
        return this;
    }

    pendingCount() {
        return this._queue.length;
    }
}

/**
 * A Date replacement whose `now()` and no-arg constructor read virtual time.
 *
 * This is the interception mechanism for `Date.now()` inside the sandbox: a vm
 * context resolves globals from its own sandbox object, so putting this on the
 * sandbox as `Date` means mod code calling `Date.now()` hits virtual time
 * without any source rewriting. All other Date statics/behaviour pass through.
 */
function makeVirtualDate(clock) {
    return new Proxy(Date, {
        get(target, prop, receiver) {
            if (prop === "now") return () => clock.now();
            return Reflect.get(target, prop, receiver);
        },
        construct(target, args) {
            if (args.length === 0) return new target(clock.now());
            return new target(...args);
        },
        apply(target, thisArg, args) {
            // Date(...) called as a function returns a string in real JS.
            if (args.length === 0) return new target(clock.now()).toString();
            return target(...args);
        },
    });
}

module.exports = { Clock, makeVirtualDate, DEFAULT_MAX_STEPS };

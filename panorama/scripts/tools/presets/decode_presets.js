// One-shot: decode player preset share codes into sparse diff-from-default objects.
// Loads the REAL codec + schema registry from ql_shared_presets.js via vm sandbox.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sharedPath = path.join(__dirname, "..", "..", "ql_shared_presets.js");
const src = fs.readFileSync(sharedPath, "utf8");

// Sandbox with Panorama stubs. Most code is guarded by typeof checks.
const sandbox = {};
sandbox.$ = { Msg: function() {}, Schedule: function() {}, persistentStorage: undefined };
sandbox.window = sandbox;
sandbox.console = console;
vm.createContext(sandbox);
try {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "..", "ql_utils.js"), "utf8"), sandbox, { filename: "ql_utils.js" });
    vm.runInContext(src, sandbox, { filename: "ql_shared_presets.js" });
} catch (e) {
    console.error("LOAD ERROR:", e.message);
}

const CODEC = sandbox.QOL_CODEC;
const UTILS = sandbox.QOL_COMPACT_SCHEMA_UTILS;
const REGISTRY = sandbox.QOL_COMPACT_SCHEMA_REGISTRY;
const DEFAULT_CONFIG = sandbox.QOL_DEFAULT_CONFIG;

const DEFAULT_HERO_OPTIONS = [
    "hero_inferno","hero_gigawatt","hero_hornet","hero_ghost","hero_atlas","hero_wraith",
    "hero_forge","hero_chrono","hero_dynamo","hero_kelvin","hero_haze","hero_astro",
    "hero_bebop","hero_nano","hero_orion","hero_krill","hero_shiv","hero_tengu",
    "hero_warden","hero_yamato","hero_lash","hero_viscous","hero_synth","hero_mirage",
    "hero_viper","hero_magician","hero_vampirebat","hero_drifter","hero_priest","hero_frank",
    "hero_bookworm","hero_doorman","hero_punkgoat","hero_necro","hero_fencer","hero_familiar",
    "hero_werewolf","hero_unicorn"
];
const COMPACT_DEFAULT_HERO_FIELD = "DEFAULT_HERO_INDEX";
const TOKEN_RE = /^\[QOL-(\d+-\d+-\d+)\]:([A-Za-z0-9\-_]+)$/i;

function decodeCode(raw) {
    const m = String(raw).replace(/\s+/g, "").match(TOKEN_RE);
    if (!m) throw new Error("bad token");
    const semver = m[1].replace(/-/g, ".");
    if (!REGISTRY.hasOwnProperty(semver)) throw new Error("unknown semver " + semver);
    const binary = CODEC.FromBase64Url(m[2]);
    const schema = UTILS.GetSchema(semver);
    const parsed = CODEC.DeserializeCompactBinary(
        binary, schema,
        function(field, value, p) {
            if (field.key === COMPACT_DEFAULT_HERO_FIELD) {
                let hi = Math.round(value);
                if (hi < 0 || hi >= DEFAULT_HERO_OPTIONS.length) hi = 0;
                p.DEFAULT_HERO = DEFAULT_HERO_OPTIONS[hi] || String(DEFAULT_CONFIG.DEFAULT_HERO || "hero_werewolf");
                return true;
            }
            return false;
        },
        function(missing, p) {
            if (!missing || !missing.key) return;
            if (missing.key === COMPACT_DEFAULT_HERO_FIELD) {
                p.DEFAULT_HERO = String(DEFAULT_CONFIG.DEFAULT_HERO || "hero_werewolf");
            } else if (DEFAULT_CONFIG.hasOwnProperty(missing.key)) {
                p[missing.key] = DEFAULT_CONFIG[missing.key];
            }
        }
    );
    return { semver: semver, parsed: parsed };
}

function diffFromDefault(parsed) {
    const out = {};
    Object.keys(parsed).sort().forEach(function(k) {
        if (!DEFAULT_CONFIG.hasOwnProperty(k)) { out[k] = parsed[k]; return; }
        const a = parsed[k], b = DEFAULT_CONFIG[k];
        const same = (typeof a === "number" || typeof b === "number")
            ? Number(a) === Number(b)
            : String(a) === String(b);
        if (!same) out[k] = a;
    });
    return out;
}

const PRESETS = [
    { key: "nkonin.me", code: "[QOL-3-2-0]:AlA0SxQjZMhMTk8lk6k5ZCADh4clKBT4Q0MGEIKiYWRkZIxYQjZiCRlkAKBQwBgggwyAjCAcWFoyAicDy8HjAUsswRJLRx5kzgIwAAAyyJApIUMmQ8kHBowMSzIBAFCWyChLZGT0U5bIKEtkzKOU8ryKIkMGAAAAoAWgIyNDkZEpkP8fpRqQpJWQQSYAk5HJ0MjI-P8D1w" },
    { key: "loony", code: "[QOL-3-2-0]:AjU0SxQjZMhMbk8lk6kBZCADh4clKBTxR0MGkEGhYGRkZIxYQjZiCRlkAKBQwBgggwyAjCAcWFoyAicDycHjAUsswRJLQh5kzhwAAAAyyJAhIUMmQ8kHBowMSzIBAFCWyChLZGT0U5bIKEtkwKOU8ryKIkMGAAAAoAWgIyNbkZEpkP8fpQKQpJWQQSYAk5HJ0MjI-P8DrQ" },
    { key: "munchkinman", code: "[QOL-4-0-0]:Aig0SxQjZMhMbmUlk6kBZCADh4clKBT4T-dzEZKi6GRkZIxYQjZiCZl2AKBQwBgggwyAjCAcWVoyAiejF8DjAUsswRJLXR5kzh4-AEAyyJAhIUMmQ8kHBowMSzJZ_lOWyChLZGT0U5bIKEtk_qiU8ryKIkM2oCPQoEWgAwBYIfcoAoY-pRqQpJWQQQYAk5HJ0MjI-P8Dqg" },
    { key: "Chumba", code: "[QOL-4-0-0]:AjI0SxQjZMhMDk8gk5UhZCADh4clKBQAQkEGAIKiAWRkZIxYQjZiCRlkAKBQwBgggwyAjCAcWFoyAicDycHjAUsswRJL3xBkzgAwAAAyyJAhIUMmQ8kHBowMSzIBAFCWyChLZGT0U5bIKEtkxKOU8ryKIkMGAAAAoAWgIyNbkZEpkP8fpQKQpBWQQQYAk5HJ0MjI-P8Dsw" },
    { key: "7eventy7", code: "[QOL-4-0-0]:Aig0SxQjZMhOFA8lk6khZCADh4clKDJARtsL0IOiAGRkZI72Q6bYEQ1kAKBQxhgggwwgCh4cWFoyAgCAycHjAUssxRJLRB5kzgIwAAAyyJAhIRPWQskHBowMSzIBAFCWyChLZmT0U5bIKEtkyoOQ8rzmIUMG0AUQokUgIctakZEpkP8fpRqQpFWQQQYAI5PJ0MjI-E8BEQ" },
    { key: "BSQTT", code: "[QOL-3-1-9]:AkowRSsjZMhMDg8lk6kBZCADh4clKBTw80IG0EShY2RkZI5YQjZiCZl2AKBQUAQggwyAjCAcWFoyAicjy8HjAUsswRJLQB5kzgIwAAAyyJApIUMmQ8kHBowMSzIBAFCWyChLZGT0U5bIKEtk3KOU8ryKIkNmAAAAoAWgIyNTkZEpkP8fpRKQpJWQQSYAk5HJ0MjI-P8D8Q" }
];

console.log("CODEC ok:", !!(CODEC && CODEC.FromBase64Url), "REGISTRY keys:", Object.keys(REGISTRY).join(","), "DEFAULT_CONFIG keys:", Object.keys(DEFAULT_CONFIG || {}).length);

const result = {};
PRESETS.forEach(function(p) {
    try {
        const dec = decodeCode(p.code);
        const diff = diffFromDefault(dec.parsed);
        result[p.key] = diff;
        console.log("\n=== " + p.key + " (schema " + dec.semver + ", " + Object.keys(diff).length + " keys) ===");
        console.log(JSON.stringify(diff, null, 2));
    } catch (e) {
        console.log("\n=== " + p.key + " FAILED: " + e.message + " ===");
    }
});

fs.writeFileSync(path.join(__dirname, "decoded_presets.json"), JSON.stringify(result, null, 2));
console.log("\nWrote decoded_presets.json");

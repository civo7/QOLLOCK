---
name: fix-qollock
description: Fix a bug with adversarial review. Implements fix, spawns 2 reviewers, revises, loops up to 3 times.
args: bug_description
---

# Fix Bug with Adversarial Review

1. **Understand the bug** — read the relevant code, trace the root cause
2. **Implement the fix** — minimal, correct change
3. **Update self-test** — if the fix changes exported functions or dependencies, update the feature's self-test
4. **Verify** — run `validate-qollock`
5. **Spawn 2 adversarial reviewers** using the `Agent` tool — one for correctness, one for side effects
6. **Revise** based on feedback
7. **Repeat** up to 3 times until zero issues
8. **Wait for user confirmation** before committing

## Common Bug Patterns in QOLLOCK

- **QOL.import() returns undefined:** Symbol not on QOL namespace. Fix: use `Utils.Xxx` instead.
- **Bare global ReferenceError:** `QOL_WARN`, `QOL_UTILS_LOADED`, `QOL_WASH_COLOR_PALETTE` are scoped inside ql_core.js's IIFE. Fix: use QOL namespace or Utils.
- **Function shadowing:** Local `function GetCachedPanel()` shadows imported `_deps.getCachedPanel`. Fix: remove local, add import destructure.
- **style.visibility → class:** Use `SetHasClass("qol-hidden", bool)` instead of `style.visibility = "collapse"/"visible"`.
- **parseInt without radix:** Add `, 10` to all parseInt calls.
- **Missing null guard on cfg:** Add `if (!cfg) return;` before accessing cfg.X.
- **$.Schedule without cancel:** Ensure timers are cancelled when the feature disables or switches modes.

Reference the Panorama Knowledge Base at /home/bytenode/Documents/DeadlockModMaking/panorama-knowledge-base/knowledge/ for API verification.

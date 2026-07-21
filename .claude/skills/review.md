---
name: review-qollock
description: Spawn 2 adversarial subagents to review recent changes, then revise. Loop up to 3 times.
---

# Adversarial Review

Review uncommitted changes or a recent commit. Uses **2 agents** (via the `Agent` tool) for subphase-level
review (small changes, single commits). For phase-level review (major extractions,
multi-commit features), use **4 agents** — add dimensions for Completeness and
Architecture. Mention "use 4 agents" in your prompt for phase-level review.

## Subphase Review (2 agents — this skill's default)

Review the current uncommitted changes (or the most recent commit).

**Agent 1 — Technical Correctness:**
Verify every claim in the changes. Check:
- Are function replacements behaviorally identical?
- Are there any missing null guards?
- Are there any broken references to moved/deleted functions?
- Are all QOL.import() symbols actually published?
- Are `// DEPENDS:` comments present for every `QOL.import()` call? (check_bridges.sh verifies this)
- Do the changes follow Panorama KB best practices?

**Agent 2 — Side Effects & Edge Cases:**
Hunt for unintended consequences. Check:
- Does the change break load order?
- Are there race conditions with $.Schedule or DeleteAsync?
- Does the change affect other files that import the modified symbols?
- Are there any silent failures (catch blocks, undefined imports)?
- Does the smoke test still pass?

After each round of review, fix the issues found, then re-run. Loop up to 3 times or until zero issues remain.

Reference the Panorama Knowledge Base at /home/bytenode/Documents/DeadlockModMaking/panorama-knowledge-base/knowledge/ for API accuracy verification.

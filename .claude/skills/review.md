---
name: review-qollock
description: Spawn 2 adversarial subagents to review recent changes, then revise. Loop up to 3 times.
---

# Adversarial Review

Review the current uncommitted changes (or the most recent commit) with 2 adversarial subagents.

**Agent 1 — Technical Correctness:**
Verify every claim in the changes. Check:
- Are function replacements behaviorally identical?
- Are there any missing null guards?
- Are there any broken references to moved/deleted functions?
- Are all QOL.import() symbols actually published?
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

---
name: plan-qollock
description: Make a multi-phase plan with full adversarial review. Study KB, fan out agents, create plan, pass to 4 reviewers, revise up to 5 rounds.
argument-hint: [goal]
---

# Plan with Adversarial Review

Create an in-depth multi-phase plan for QOLLOCK. Full process:

## Phase 1: Study
1. Read the project's CLAUDE.md at CLAUDE.md (repo root) — understand architecture and load order first
2. Read /home/bytenode/Documents/DeadlockModMaking/panorama-knowledge-base/CLAUDE.md
3. Read relevant knowledge files (js-api.md, css-properties.md, js-events.md, etc.)

## Phase 2: Fan-Out Audit
Spawn 6 subagents in parallel using `Agent` with `agentType: "Explore"`, each auditing a different dimension:
- Technical structure (line counts, function analysis, dependency mapping)
- Code quality (silent catches, bare globals, magic numbers, dead code)
- Panorama KB compliance (deprecated APIs, unsupported CSS, async patterns)
- Architecture patterns (QOL.import() consistency, feature registration, bridge usage)
- Test coverage & validation (smoke test gaps, self-test completeness, bridge checker coverage)
- Security & edge cases (null guards, timer cancellation, mode-switch cleanup)

## Phase 3: Synthesize Plan
Compile findings into a structured plan with:
- Executive summary
- Phases ordered by dependency
- Effort estimates per phase
- Risk assessment with rollback strategy
- Target metrics

## Phase 4: Adversarial Review
Spawn 4 reviewers attacking from:
- Technical Correctness (verify every claim against actual code)
- Completeness & Gaps (what's missing, what's wrong, scope gaps)
- Feasibility & Risk (timeline realism, hidden costs, skill requirements)
- Architecture & Design (better alternatives, pattern consistency)

## Phase 5: Revise
Apply reviewer feedback. Repeat review up to 5 times until convergence.
Present the fully revised plan.

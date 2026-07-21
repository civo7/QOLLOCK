---
name: audit-qollock
description: Fan out parallel subagents to audit the QOLLOCK codebase against the Panorama Knowledge Base
args: scope
---

# QOLLOCK Code Audit

Perform a deep audit of the QOLLOCK codebase. Fan out 4-6 agents in parallel, each focusing on a different dimension:

1. **ql_core.js** — dead code, function shadows, bare globals, bridge exports, feature dispatch
2. **Feature files** — QOL.import() consistency, DEPENDS accuracy, self-tests, silent catches, style.visibility
3. **ql_settings.js** — structure, dead code, bare globals, QOL.import() usage, arcade coupling
4. **Infrastructure** — ql_utils, ql_state, ql_bridge, ql_config, ql_panelcache, ql_shared_presets
5. **Cross-cutting** — CSS issues, XML includes, bridge usage patterns, performance hotspots
6. **KB cross-reference** — verify against Panorama Knowledge Base at /home/bytenode/Documents/DeadlockModMaking/panorama-knowledge-base/knowledge/

Each agent should:
- Read relevant files and sections
- Count issues (silent catches, bare globals, FindChildTraverse calls, etc.)
- Flag anything that violates Panorama KB documented behavior
- Return findings with exact line numbers

If `$ARGUMENTS` is provided, focus the audit on that specific area. Otherwise, audit everything.

After all agents report, compile findings into a structured report with severity tiers (CRITICAL/HIGH/MEDIUM/LOW).

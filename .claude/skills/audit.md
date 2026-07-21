---
name: audit-qollock
description: Fan out parallel subagents to audit the QOLLOCK codebase against the Panorama Knowledge Base
args: scope
---

# QOLLOCK Code Audit

Perform a deep audit of the QOLLOCK codebase. Fan out 6 agents in parallel using `Agent` with `agentType: "Explore"`. Each agent focuses on a different dimension:

1. **ql_core.js** — dead code, function shadows, bare globals, bridge exports, feature dispatch
2. **Feature files** — QOL.import() consistency, DEPENDS accuracy, self-tests, silent catches, style.visibility
3. **ql_settings.js** — structure, dead code, bare globals, QOL.import() usage, arcade coupling
4. **Infrastructure** — ql_utils, ql_state, ql_bridge, ql_config, ql_panelcache, ql_shared_presets
5. **Cross-cutting** — CSS issues, XML includes, bridge usage patterns, performance hotspots
6. **KB cross-reference** — verify against Panorama Knowledge Base at /home/bytenode/Documents/DeadlockModMaking/panorama-knowledge-base/knowledge/

Each agent must:
- Read relevant files using the Read tool (do NOT use Bash grep/cat — use the dedicated tools)
- Count issues (silent catches, bare globals, FindChildTraverse calls, etc.)
- Flag anything that violates Panorama KB documented behavior
- Return findings with exact file paths and line numbers
- Categorize each finding: CRITICAL / HIGH / MEDIUM / LOW
- Include a `failure_scenario` for every CRITICAL and HIGH finding

If `$ARGUMENTS` is provided, focus the audit on that specific area. Otherwise, audit everything.

After all agents report, compile findings into a structured report:
- Group by severity (CRITICAL → HIGH → MEDIUM → LOW)
- Within each tier, group by file
- Deduplicate findings that span multiple dimensions
- Present as a markdown table with columns: Severity | File | Line | Summary | Fix suggestion

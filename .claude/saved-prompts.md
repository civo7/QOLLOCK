# QOLLOCK Saved Prompts

## Audit

```
Fan out 4-6 subagents in parallel to audit the QOLLOCK codebase. Focus on:
1. ql_core.js — dead code, function shadows, bare globals, bridge exports
2. Feature files — QOL.import() consistency, DEPENDS accuracy, self-tests
3. ql_settings.js — structure, dead code, bare globals
4. Cross-cutting — CSS, XML, bridge patterns, KB compliance
Reference /home/bytenode/Documents/DeadlockModMaking/panorama-knowledge-base/knowledge/
Compile findings with exact line numbers, severity tiers (CRITICAL/HIGH/MEDIUM/LOW).
```

## Plan + Adversarial Review

```
Make an in-depth multi-phase plan to [GOAL]. After making the plan, pass it to
4 adversarial subagent reviewers with instructions to refer to
/home/bytenode/Documents/DeadlockModMaking/panorama-knowledge-base/.
Attack from: Technical Correctness, Completeness & Gaps, Feasibility & Risk,
Architecture & Design. Revise based on feedback. Repeat up to 5 times.
Present the fully revised plan.
```

## Implement Phase with Review

```
Implement [PHASE] in subphases. After each subphase, spawn 2 adversarial
subagents to attack the implementation. Revise and continue. After each phase,
spawn 4 adversarial subagents to attack the implementation, revise and loop
up to 3 times. Wait for user confirmation, then commit. Repeat until done.
```

## Extract Feature File

```
Extract [FEATURE NAME] from [SOURCE FILE] into a new feature file.
Follow the standard pattern: IIFE wrapper, QOL.import(), DEPENDS comment,
constants, functions, QOL.register(), self-test.
1. Verify zero remaining callers in source file
2. Add all used State fields to stateKeys
3. Add every external symbol to QOL.import()
4. Add self-test checking typeof for key functions
5. Add XML include if HUD context
6. Run validate-qollock
7. Spawn 2 adversarial reviewers
```

## Debug Runtime Error

```
A runtime error was found in the Panorama console. Trace the error:
1. Read the stack trace — identify the file, function, and line
2. Read the relevant code — is it a QOL.import() mismatch? Bare global?
   Function shadow? Missing null guard?
3. Fix the root cause using the appropriate pattern
4. Run validate-qollock
5. Spawn 2 adversarial reviewers
```

## Deep Save/Load Review

```
Do a line-by-line deep review of the save/load system.
Trace the ENTIRE save flow and load flow end-to-end.
Identify every race condition, missing guard, error path, and fragility.
Check cross-context attribute communication, config serialization,
hero detection state machine, and corrupt config recovery.
```

## CSS/XML Audit

```
Audit all CSS and XML files for Panorama compliance:
- CSS: check for unsupported combinators, pseudo-elements, @media, overflow values
- XML: verify all script/style includes have matching files on disk
- Cross-reference against /home/bytenode/Documents/DeadlockModMaking/panorama-knowledge-base/knowledge/
Report all issues with exact file paths and line numbers.
```

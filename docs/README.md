# Documentation

For downloads, features and credits, see the [project README](../README.md).
For development setup, start with [Contributing](../CONTRIBUTING.md).

## Development References

| Reference | Purpose |
| --- | --- |
| [Architecture](../ARCHITECTURE.md) | Runtime contexts, ownership and technical contracts |
| [Helpers](HELPERS.md) | Shared APIs and lifetime semantics |
| [Settings](ADDING_SETTINGS.md) | Defaults, metadata, UI, persistence and compatibility |
| [Localization](LOCALIZATION.md) | Visible text and translation workflows |
| [Core services](core/) | Individual service contracts |
| [Features](features/README.md) | Feature ownership and focused references |
| [UI](ui/) | Controls, previews, tooltips and Customize |
| [Known gotchas](KNOWN_GOTCHAS.md) | Native Panorama pitfalls |

## Verification and Maintenance

| Reference | Purpose |
| --- | --- |
| [Testing](TESTING.md) | Offline checks and their limits |
| [Client checklist](TEST_CHECKLIST.md) | Maintainer-run game verification |
| [Releases and native updates](RELEASING.md) | Prepared ZIP publication, upstream reviews and notifications |
| [Profiling](PROFILING.md) | Measurements and capture tooling |
| [Performance guardrails](PERF_GUARDRAILS.md) | Polling, caching and rendering constraints |
| [Game update audit](GAME_UPDATE_AUDIT.md) | Native resource review procedure |

## Reports and Outstanding Work

These documents retain evidence or unfinished checks, not additional runtime
specifications. Their measurements and completion claims apply to the recorded
source snapshots, not automatically to the current mod.

- [Modular rewrite acceptance](MODULAR_REWORK.md)
- [Customize client acceptance](ui/customize-rework.md)
- [HUD rewrite comparison](HUD_REWRITE_COMPARISON.md)
- [Helper audit](HELPER_AUDIT.md)
- [Profiler audit](PROFILER_AUDIT.md)
- [Stutter investigation](STUTTER_INVESTIGATION.md)
- [Translation workflow repair](TRANSLATION_WORKFLOW_STATUS.md)

Removed migration plans and superseded release audits remain in Git history.
Use current source exports and active XML includes as the technical authority.

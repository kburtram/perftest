# perftest CLI

`packages/perftest-cli` — the orchestrator. Run via
`node packages/perftest-cli/dist/cli.js <command>` (or the `perftest` bin once
linked). Commands and exit codes follow design §26 exactly; they are a public
contract for CI gates.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Run completed, no gated regression |
| 1 | Gated regression found |
| 2 | Config or schema validation failed |
| 3 | Environment preflight failed |
| 4 | Scenario failed |
| 5 | Infrastructure or collector failure (also: command not implemented yet) |
| 6 | Insufficient valid samples |

## Commands

### `perftest doctor [--json] [--config <path>]`

Environment preflight (design §13.3). Reports machine identity (hostname, OS,
CPU, memory) and per-check status. Checks that are not implemented yet are
listed as `SKIP` with the milestone they arrive in — the report never
overstates what was verified. With `--config`, additionally validates the
config file. Exits 3 if any check fails.

Current checks: node version, docker availability, dotnet SDK, disk space,
free memory. Arriving later: VS Code resolution (M1), SQL container health,
machine idle, AC power, CPU frequency policy (M4), ETW elevation (M5).

### `perftest schema validate <file> [--contract marker|perf-config|perf-result]`

Validates a JSON/JSONC file against a contract schema. Auto-detects the
contract from the document shape when `--contract` is omitted. Prints each
schema violation; exits 0/2.

### `perftest scenarios list`

Lists the scenario registry with implementation status (`implemented` vs
`planned (M#)`) and each scenario's official metrics.

### `perftest collectors list`

Lists implemented collectors (name, cost class, allowed pass types) and the
planned design-§14.3 catalog separately — never conflating the two.

### `perftest store init [--db <path>]`

Creates/opens the SQLite store and applies the canonical schema
(idempotent). Prints the resulting table/view list.

### `perftest run --config <path> [--scenario <id>] [--pass <type>]`

Loads and schema-validates the config (real today; exit 2 on invalid), then
executes the run pipeline. **Pipeline lands in Milestone 1** — until then the
command reports not-implemented and exits 5 without writing anything.

### `perftest report <runId> [--open]` · `perftest compare --current <runId> --baseline <runId|tag>` · `perftest baseline set <name> <runId>` · `perftest cleanup --older-than <d> [--keep-regressions]`

Reporting, comparison, baseline management, and artifact retention — land in
Milestones 1/6′. Same honest not-implemented behavior until then.

## Config loading

`--config` files are JSONC (comments + trailing commas allowed). Loading:
parse → schema validation (all errors reported) → `runId: "auto"` resolution →
`sha256` config hash. The raw text is preserved and snapshotted into each run
directory as `run-config.snapshot.json`.

## Logging

Set `PERFTEST_LOG_LEVEL=trace|debug|info|warn|error` to control console
verbosity. During a run, every event (all levels) is also appended to
`perf-runs/<runId>/harness-log.jsonl`. See
[HARNESS_TELEMETRY.md](HARNESS_TELEMETRY.md).

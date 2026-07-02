# MSSQL VS Code Perf Harness — Implementation Plan

> Working backlog for the autonomous build. Derived from `PERFTEST_BUILD_PROMPT.md` and
> `perftest-docs/mssql-vscode-perf-system-v2/MSSQL_VSCODE_PERF_SYSTEM_DESIGN.md` (§32/§33),
> plus user-expanded scope: full diagnostic pass, STS trace context building on the sts2
> refactor, harness self-telemetry, and a `docs/` folder built alongside the code.
>
> **Restart protocol:** if this job is restarted in a clean session, read `PROGRESS.md`
> (append-only log, newest entry at bottom) to find the last completed task, then resume at
> the first unchecked box below. Re-read the design doc sections referenced by that milestone.

## Scope decisions (locked)

- Repos: harness in `C:\repos\test\perftest` (blank git repo), product changes on branch
  `dev/karlb/perftest` in `C:\repos\test\vscode-mssql` and `C:\repos\test\sqltoolsservice`.
- Order: **M0 → M1 → M2 → M4′ (connect+query timing) → M6′ (regression gate)** = the core
  local test box, then **M3 (STS trace context / sts2 alignment) → M4 (XEvents server timing)
  → M5 (diagnostic collectors)** = the full-diag expansion. Central/fleet stays deferred
  (seams preserved); we decide on it with the user later.
- Tech: TypeScript strict on Node LTS, npm workspaces monorepo; `ajv` (JSON Schema),
  `better-sqlite3`, `ws`, `commander`, `@vscode/test-electron` (acquire only; direct spawn).
- SQL: Docker Compose pinned by digest as primary; `external` provider fallback using
  `STS2_SQLSERVER_CONNSTRING` for dev/testing.
- Harness self-telemetry from day one: every component logs structured JSONL
  (`harness-log.jsonl` per run) with component/event/level/timestamps + harness-internal
  span ids, so the harness itself is fully traceable.
- Docs: `perftest/docs/` grows with each milestone; quality bar = the input design docs.
- Non-negotiable guardrails: see PERFTEST_BUILD_PROMPT.md §guardrails. Never fabricate a
  metric. Official metrics from markers only, measurement pass only. `PERF_MODE` gates every
  product change. Success proven or rep is `invalid`.

## Milestone 0 — Contracts and CLI skeleton

- [x] 0.1 Monorepo scaffold: root `package.json` (npm workspaces), `tsconfig.base.json`
      (strict), `.gitignore`, workspace layout per design §5
      (`packages/perf-contracts`, `packages/perftest-cli`, `extensions/mssql-perf-driver`,
      `sql/`, `scripts/`, `examples/`, `docs/`, `perf-runs/`).
- [x] 0.2 `perf-contracts`: copy 3 JSON schemas + SQLite schema verbatim from perftest-docs;
      TS types mirroring marker/result/config/control messages; runtime validators (ajv);
      example config/result/marker as test fixtures that must validate.
- [x] 0.3 Harness telemetry core: `HarnessLogger` (structured JSONL + pretty console),
      harness span helper, used by all later components.
- [x] 0.4 CLI skeleton (`perftest`): commander wiring for `doctor`, `run`, `report`,
      `compare`, `baseline set`, `scenarios list`, `collectors list`, `schema validate`,
      `cleanup`; §26 exit-code contract as a single ExitCode enum; config loader (jsonc +
      schema validation + defaults).
- [x] 0.5 SQLite store init from schema; `perftest doctor` first version (env probe: node,
      docker, dotnet, disk, memory; unimplemented checks reported as skipped); unit tests
      (contracts + store + logger).
- [x] 0.6 Docs: `docs/README.md` (system overview), `docs/CONTRACTS.md`, `docs/CLI.md`,
      `docs/HARNESS_TELEMETRY.md`. Git commit at milestone end.

**Acceptance:** example config/result/marker validate via `perftest schema validate`;
`tsc --strict` clean; SQLite DB initializes; unit tests pass.

## Milestone 1 — Smallest end-to-end loop (seed crystal)

- [x] 1.1 Control server: `ws` on 127.0.0.1, random token auth, §9.1 message types,
      lifecycle state machine, clock calibration ping/pong (§11.3), marker ingestion.
- [x] 1.2 Marker sink: append-only `markers.jsonl` writer + schema validation + required
      marker bookkeeping (`scenario.start`/`scenario.end`).
- [x] 1.3 VS Code launcher: `@vscode/test-electron` acquire pinned build; direct spawn with
      fresh `--user-data-dir`/`--extensions-dir`, §13.1 base args, env from §9; graceful
      shutdown + kill escalation; stdout/stderr capture.
- [x] 1.4 `mssql-perf-driver` extension: activates only when `PERF_MODE=1`, connects to
      control URL, `hello`→calibration→`ready`, scenario step engine (command, openDocument,
      waitForMarker, waitForCommandCompletion), `noop` scenario emitting
      `scenario.start`/`scenario.end`.
- [x] 1.5 Rep pipeline: run dir layout (§22), normalizer (markers → official
      `scenario.wallclock` + result.json §20), SQLite insertion (§23), minimal Markdown report.
- [x] 1.6 Real E2E verification: `perftest run --scenario noop` on this machine, VS Code
      launched unforked and shut down cleanly; inspect real markers.jsonl/result.json.
- [x] 1.7 Docs: `docs/ARCHITECTURE.md` (control plane + lifecycle diagrams),
      `docs/RUNNING_TESTS.md`. Commit.

**Acceptance:** schema-valid `result.json` with official `scenario.wallclock` from real
markers; SQLite rows inserted; report rendered; driver connects only when `PERF_MODE=1`.

## Milestone 2 — Product command scenarios (first vscode-mssql instrumentation)

- [x] 2.1 Deep-read vscode-mssql activation + command seams (from explorer report).
- [x] 2.2 Perf telemetry module in vscode-mssql behind `PERF_MODE`: bounded-queue marker
      writer (control channel or direct sink), activation begin/end markers, command
      begin/end wrapper.
- [x] 2.3 Product-private perf API (§16.3 subset): activation state + child process PIDs.
- [x] 2.4 Driver: `ext-normal-activation` scenario + generic command scenario.
- [x] 2.5 Verify zero behavior change with PERF_MODE off (build + smoke run + explicit check).
- [x] 2.6 Baseline compare plumbing (store metrics keyed by environmentHash, `baseline set`).
- [x] 2.7 Docs: `docs/PRODUCT_INSTRUMENTATION.md`. Commit both repos.

**Acceptance:** activation scenario yields official `scenario.wallclock` + `extension.activate`
from real markers; PERF_MODE off ⇒ identical behavior.

## Milestone 4′ — Connect + query scenarios (timing payload)

- [x] 4.1 SQL provisioning: docker-compose pinned by digest, deterministic seed
      (`create-perf-db.sql`, 10k-row fixture, OE shape), `external` provider fallback
      (STS2_SQLSERVER_CONNSTRING), snapshot/reset strategy, cache modes.
- [x] 4.2 `connect-local-container` scenario: semantic connection-ready end marker
      (`mssql.connection.ready` product marker or perf-API probe), STS spawn PID marker.
- [x] 4.3 `query-10k-results` scenario: webview mark bridge
      (`performance.timeOrigin + performance.now()` → postMessage → extension → sink),
      `mssql.resultsGrid.renderComplete`, success proof rowCount == 10000 else `invalid`.
- [ ] 4.4 processSampler collector (low-cost CPU/RSS of owned PIDs) — measurement-approved.
- [x] 4.5 Real E2E both scenarios; verify against local SQL (docker or external).
- [x] 4.6 Docs: `docs/SCENARIO_AUTHORING.md`, `docs/SQL_PROVISIONING.md`. Commit.

**Acceptance:** both scenarios produce schema-valid results end to end; query proves 10k rows;
all product changes PERF_MODE-gated.

## Milestone 6′ — Baselines, regression gate, reports

- [x] 6.1 Aggregation math (§24.1: trimmed mean/median, CV, p90/p95, CI) + invalid-run rules
      (§24.2) with unit tests.
- [x] 6.2 Regression classification (§24.3: pct + absolute floor + Welch t, worst-metric-wins,
      environmentHash matching) + comparison JSON + SQLite comparisons tables.
- [x] 6.3 Reports: console summary, Markdown, static HTML (§27 sections incl. per-rep samples,
      verdicts, artifact links, suggested diagnostic follow-up command).
- [x] 6.4 CLI exit codes wired (regression ⇒ 1); artifact retention cleanup.
- [x] 6.5 Prove the gate: synthetic injected delay ⇒ REGRESSED + exit 1; deliberately missing
      required marker ⇒ `invalid` rep, never a fast number.
- [x] 6.6 Docs: `docs/REGRESSION_MODEL.md`, `docs/REPORTS.md`. Commit.

**Acceptance:** re-run vs stored baseline reports deltas/verdicts; injected delay fails run;
missing marker ⇒ invalid.

## Milestone 3 — STS perf diagnostics (sts2-aligned) + correlation

(Sequenced after the local box works. **Plan amendment vs design §18:** exploration showed
sts2 already ships a journaled envelope observability core — `IEnvelopeSink`, gapless-seq
JSONL journal with `corr`/`cause` causality, `Microsoft-SqlTools-Sts2` EventSource counters,
`v2/diagnostics.*` RPCs — gated by `STS_ENABLE_STS2=1`. We build STS perf diag ON that seam
instead of a parallel ActivitySource story; W3C traceparent/OTLP becomes an adapter later.)

- [x] 3.1 Document the decision + mapping (envelope `corr`/`cause` ↔ harness traceId model)
      in docs/STS_INSTRUMENTATION.md.
- [x] 3.2 STS self-report: minimal `PERF_MODE`-gated startup marker POST to PERF_MARKER_URL
      (`sts.process.ready` with pid/version). VERIFIED E2E: marker arrives with correct
      run identity (env inheritance VS Code → ext host → LanguageClient child works).
- [x] 3.3 Harness `stsEnvelopeJournal` collector: journal dirs harvested + parsed E2E.
      FINDING: the sts2 multiplexer routes LEGACY traffic untouched — only v2/* messages
      journal, so legacy-path runs journal lifecycle envelopes only. RPC-latency
      normalization is in place and lights up when v2 traffic exists.
- [x] 3.4 Correlation: PERF_* env inheritance into STS verified. Envelope→marker adapter
      sink (IEnvelopeSink impl) deferred until v2 traffic makes it useful — seam
      documented in STS_INSTRUMENTATION.md.
- [ ] 3.5 `dotnet-counters` on `Microsoft-SqlTools-Sts2` EventSource (needs a Windows
      graceful-stop story for `dotnet-counters collect`).
- [x] 3.6 STS builds clean; self-report gate structural; sts2 stays opt-in. Committed
      (sqltoolsservice 1db0315a).

**Acceptance:** a diagnostic run of connect/query scenarios yields an STS-side timing
breakdown (rpc handler latencies) correlated to the scenario window, with zero product
behavior change when flags are off.

## Milestone 4 (rest) — Server-side SQL timing

- [ ] 4.7 XEvents session create/read scripts; collector start/stop per scenario window;
      normalizer emitting `sqlserver.duration`/`cpu`/`logicalReads` + derived
      `sql.networkDriver.duration` with confidence + provenance.
- [ ] 4.8 `expand-tables-node` scenario.
- [ ] 4.9 Docs update. Commit.

## Milestone 5 — Diagnostic collectors (full diag)

- [x] 5.1 Collector framework hardening per §14: full lifecycle wired into the pipeline
      (validate → preLaunch launch-spec amendment → postLaunch → onProcessDiscovered →
      onScenarioStart/End via markers → preShutdown → postExit → normalize → teardown),
      every hook fault-isolated; collector metrics forced official:false structurally;
      missing tools surface as rep validations.
- [x] 5.2 CDP ext-host CPU profile: --inspect-extensions + Node inspector protocol,
      Profiler start/stop on the scenario window → exthost.cpuprofile (VERIFIED, 287KB
      real profile). Renderer trace/profile still open (needs --remote-debugging-port
      target discovery).
- [x] 5.3 dotnet-trace collector (attach on STS pid discovery, finalizes on STS exit;
      tool stdout/stderr captured). dotnet-counters still open (graceful-stop story).
- [x] 5.4 WPR/ETW collector: wpr start/stop on scenario window, elevation/policy failures
      degrade to validation warnings (VERIFIED: this Cloud PC blocks profiling policy —
      0xc5585011 — collector warns and continues; wpr -cancel guard on teardown).
- [x] 5.5 Full-diagnostic pass E2E on query-10k (config.fulldiag.local.jsonc): passed with
      cpuprofile + sts2 journal + process samples in the rep dir; all metrics official:false.
- [x] 5.6 Docs: `docs/DIAGNOSTIC_COLLECTORS.md`. Commit.

## Cross-cutting (every milestone)

- Harness self-telemetry on every new component (logger + spans).
- Unit tests for pure logic; real E2E for launch/control/marker loops.
- `PROGRESS.md` entry after every task; checkbox updates here.
- Git commit per task/milestone in perftest; product repos commit on their branches.

## Deferred (seams preserved, do NOT build)

- Central/fleet aggregation, Bencher push, shared dashboards (§30).
- `mcp-server-first-request` scenario (until MCP surface stabilizes).

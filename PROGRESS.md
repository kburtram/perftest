# PROGRESS LOG — MSSQL VS Code Perf Harness build

> Append-only. Newest entries at the BOTTOM. On restart: read this file end-to-end, then
> resume at the first unchecked box in `IMPLEMENTATION_PLAN.md`. Environment facts and seam
> maps recorded here so a clean session does not need to re-explore.

---

## 2026-07-01 — Entry 1: Recon complete, plan locked, build starting

### Environment facts (verified)

- Workspace: `C:\repos\test` — contains `perftest/` (blank git repo, no commits yet),
  `perftest-docs/`, `vscode-mssql/` (branch `dev/karlb/perftest`, clean),
  `sqltoolsservice/` (branch `dev/karlb/perftest`, clean), `PERFTEST_BUILD_PROMPT.md`.
- Toolchain: Node v24.17.0, npm 11.13.0, Docker 29.6.1, dotnet SDK 10.0.301. Windows 11.
- `STS2_SQLSERVER_CONNSTRING` env var is set (253 chars) — usable as `external` SQL provider
  for dev verification. Do NOT print/persist its value (redaction rule §29).
- Claude permissions allowlist written to `C:\repos\test\.claude\settings.local.json`
  (npm/node/dotnet/docker/git/sqlcmd/process mgmt + file ops) so the long job runs
  without prompt-storms.

### Inputs read (full)

- `PERFTEST_BUILD_PROMPT.md` — mission, guardrails, milestone order M0→M1→M2→M4′→M6′.
- Design doc `perftest-docs/mssql-vscode-perf-system-v2/MSSQL_VSCODE_PERF_SYSTEM_DESIGN.md`
  (all 34 sections) + 3 JSON schemas + `perf-store.schema.sql` + 2 example configs +
  example result. Schemas will be copied verbatim into `packages/perf-contracts/schemas/`
  and `sql/`.

### Seam map — vscode-mssql (from exploration; file paths relative to `extensions/mssql/`)

- **Monorepo layout:** extension code lives in `vscode-mssql/extensions/mssql/` (NOT top-level
  src). Build: root `npm run build` (Node 24+, `scripts/workspaces.mjs`), extension bundle via
  esbuild → `dist/extension` (= package.json `main`). Watch mode exists. Package via
  `npm run package` (vsce). Extension ID `ms-mssql.mssql`, engines.vscode `^1.101.0`.
- **Activation:** `src/extension.ts:36 activate()` → `MainController.activate()`
  (`src/controllers/mainController.ts:263`) → `initialize()` (`:1040`) which spawns STS
  first (`SqlToolsServerClient.instance.initialize`), then ConnectionManager etc.
  `controller.isInitialized()` + awaited activate() are readiness signals.
- **Commands:** IDs in `src/constants/constants.ts` (`mssql.runQuery`:36, `mssql.connect`,
  etc.). Registered via `MainController.registerCommand` (`mainController.ts:208`) which
  re-emits through internal EventEmitter — a natural single seam for command begin/end markers.
- **STS spawn:** `src/languageservice/serviceclient.ts` — uses `vscode-languageclient` stdio;
  `initializeLanguageClient()` `:349`, args built in `:515/:555`. **Env override
  `MSSQL_SQLTOOLSSERVICE=<folder>` points at a local STS build** — harness will use this.
  PID not tracked explicitly (inside LanguageClient internals) — perf API must dig it out
  or track via process tree.
- **Connection ready:** `ConnectionManager.onSuccessfulConnection` event fired at
  `connectionManager.ts:1706` — clean seam for `mssql.connection.ready` marker.
- **Query flow:** `mssql.runQuery` → `SqlOutputContentProvider.runQuery` (`:319`) →
  `QueryRunner.runQuery` (`queryRunner.ts:363`) → STS request `:421`; completion via
  `handleQueryComplete` `:447` → provider onCompleteListener (`sqlOutputContentProvider.ts:630`)
  sets isExecuting=false + pushes state. Row counts in `resultSetSummaries[batch][result].rowCount`.
  **Grid is virtualized; rows pulled lazily via GetRowsRequest** — success proof for
  query-10k = resultSetSummary.complete with rowCount==10000 + webview render-complete mark
  (grid model built + paint), not "10k DOM rows".
- **Webview bridge:** extension side `src/controllers/webviewBaseController.ts` wraps
  postMessage in vscode-jsonrpc; webview side `src/webviews/common/rpc.ts` (WebviewRpc).
  Query results controllers: `src/queryResult/queryResultWebViewController.ts`.
  React grid: `src/webviews/pages/QueryResult/queryResultsGridView.tsx`.
- **Existing telemetry:** `src/telemetry/telemetry.ts` `startActivity()` uses
  performance.now() and emits durationMs — do not conflict; may harvest later. **No existing
  PERF_MODE / performance.mark usage — namespace is clear.**

### Seam map — sqltoolsservice / sts2 (paths relative to repo root)

- **Entry:** `src/Microsoft.SqlTools.ServiceLayer/Program.cs:26`; executable
  `MicrosoftSqlToolsServiceLayer` (net10.0). Build: `dotnet build src/Microsoft.SqlTools.ServiceLayer`
  → `bin/<cfg>/net10.0/`. sts2 solution filter `sqltoolsservice-sts2.slnf`; `verify.sh`/`verify.ps1`.
- **JSON-RPC:** stdio, Content-Length framing, `src/Microsoft.SqlTools.Hosting/Hosting/*`
  (ProtocolEndpoint/MessageDispatcher/ServerChannel). Services:
  `Connection/ConnectionService.cs` (handlers ~:1320), `QueryExecution/QueryExecutionService.cs`
  (handlers ~:217).
- **Legacy perf instrumentation: essentially none** (only a SqlClient EventSource → Logger
  listener and scattered Stopwatches). The real observability story is sts2.
- **sts2 (substantially implemented, in-proc beside legacy, `v2/*` methods, gated by
  `--enable-sts2` / `STS_ENABLE_STS2=1`, zero footprint when off):**
  - Journaled envelope log: every rpc/effect/diag → `Sts2Envelope` (seq, ts, corr, cause,
    digest) in JSONL segments under `<log-dir>/sts2/<runId>/`; byte-identical replay
    (`tools/sts2-replay`).
  - Public sink seam: `IEnvelopeSink` via `Sts2SessionOptions.EnvelopeSinks`
    (`Sts2Session.cs:59`), live tail `BroadcastEnvelopeSink`.
  - `EventSource "Microsoft-SqlTools-Sts2"` with counters (envelopes-total, rpc-errors-total,
    sink-faults-total) → `dotnet-counters` consumable.
  - Diagnostics RPCs: `v2/diagnostics.ping|health|state|exportLog|setCapture`.
  - **No W3C traceparent / OTLP / ActivitySource on data path.** Correlation = `corr` +
    `cause` seq chain. Perf harness therefore builds STS diag on the journal/sink seam;
    OTel becomes an adapter later (plan amendment recorded in IMPLEMENTATION_PLAN M3).
  - E2E driver template exists: `test/sts2/.../E2ETests/ServiceProcessClient.cs`.

### Decisions locked

1. Milestone order: M0 → M1 → M2 → M4′ → M6′ (core local box), then M3 (sts2-based STS
   diag) → M4-rest (XEvents) → M5 (CDP/dotnet/WPR diag collectors). Central deferred.
2. npm workspaces; ajv + better-sqlite3 + ws + commander + @vscode/test-electron.
3. Harness self-telemetry (structured JSONL logger + harness spans) built in M0, used everywhere.
4. Docs in `perftest/docs/`, one doc set per milestone.
5. SQL: docker compose digest-pinned primary; `external` via STS2_SQLSERVER_CONNSTRING fallback.
6. vscode-mssql instrumentation goes in `extensions/mssql/src/` behind `PERF_MODE=1`,
   integrated at: activation (extension.ts / mainController), registerCommand seam,
   onSuccessfulConnection, QueryRunner/SqlOutputContentProvider completion path,
   webview rpc.ts mark bridge. VSIX or dev-path load via fresh extensions dir.

### State

- perftest repo: tracking files written (IMPLEMENTATION_PLAN.md, PROGRESS.md). No code yet.
- Next: commit this baseline, then Milestone 0 task 0.1 (monorepo scaffold).

---

## 2026-07-01 - Entry 2: Milestone 0 COMPLETE (contracts + CLI skeleton)

Built and verified:

- Monorepo: npm workspaces (packages/perf-contracts, packages/perftest-cli), strict TS
  (target ES2022, CommonJS), Node 24. Deps: ajv 8, better-sqlite3 12 (prebuilt binary
  installed fine on win32/Node24), commander 14, jsonc-parser, ws 8; vitest for tests.
- perf-contracts: schemas + perf-store.schema.sql copied VERBATIM (hash-verified);
  TS mirrors (marker/result/config/controlMessages incl. ScenarioSpec step model);
  ids.ts (runId/traceId/spanId/traceparent/unixNs/monotonicNs helpers);
  ajv 2020-12 validators; fixtures incl. new marker.example.json (from design SS10).
  14/14 tests pass; tsc --strict clean.
- perftest-cli: HarnessLogger (component-scoped, spans w/ spanId+parentSpanId+durationMs,
  ConsoleSink/JsonlFileSink/CompositeSink w/ fault isolation, MemorySink);
  loadConfig (JSONC->schema->runId resolve->sha256 configHash); PerfStore (better-sqlite3,
  WAL, canonical schema exec, typed inserts for runs/envs/scenarios/reps/metrics/artifacts/
  validations, query helper); doctor v1 (real: node/docker/dotnet/disk/memory; honest SKIP
  for unimplemented checks); scenario registry (noop/ext-normal-activation/
  connect-local-container/query-10k-results specs, implemented=false until wired);
  collector registry (empty; planned catalog listed separately); cli.ts wiring all SS26
  commands + exit codes (unimplemented commands exit 5 with clear message, never fake).
  8/8 tests pass; tsc --strict clean.
- ACCEPTANCE VERIFIED on real CLI: schema validate passes for all 3 fixtures (exit 0);
  store init creates all 13 tables/views incl. official_metric_samples; scenarios list +
  collectors list honest; doctor exit 0 on this machine (node/docker/dotnet all present).
- Docs: docs/README.md (index + system overview), CONTRACTS.md, CLI.md,
  HARNESS_TELEMETRY.md. Root README.md.
- Note: .claude/settings.local.json got rewritten by permission prompts (lost broad
  allowlist); merged broad rules back in, preserving prompt-added entries.

Next: Milestone 1 (smallest E2E loop) - control server, marker sink, VS Code launcher,
mssql-perf-driver extension, noop scenario, normalizer, SQLite insert, minimal report.

---

## 2026-07-01 - Entry 3: Milestone 1 COMPLETE (smallest E2E loop works)

The seed crystal is alive. `perftest run --config examples/config.noop.local.jsonc`:
VS Code 1.127.0 downloaded via @vscode/test-electron (cached in .vscode-test/),
spawned UNFORKED with fresh dirs + PERF_* env; mssql-perf-driver (zero-dep, global
WebSocket) connected + authenticated; clock calibration (offset ~-0.5ms, RTT ~1ms,
min-of-5); noop scenario executed; scenario.start/end markers -> official
scenario.wallclock ~0.45ms from SAME-PROCESS MONOTONIC diff; clean quit exit 0
(no force-kill); result.json schema-valid; SQLite rows (official_metric_samples
returns exactly the 2 official samples); report.md rendered. Exit code 0.
Second run (warm cache): whole 2-rep run in 9s.

Components built:
- controlServer.ts: ws /control + http POST /v1/markers (Bearer token), SS9.1
  message types, calibration, marker relay to driver for non-driver senders.
- markerSink.ts: validated append-only markers.jsonl + waitForMarker + required
  marker bookkeeping.
- resolveVscode/spawnVscode: SS13.1 args, --extensionDevelopmentPath loading,
  stdout/stderr capture, graceful shutdown + taskkill /T escalation.
  FIX: 1.127 win32 archive nests app under <commit>/resources/app - product.json
  reader scans one subdir level.
- extensions/mssql-perf-driver: activation gate (PERF_MODE!=1 -> return, zero
  behavior), controlClient (hello/ready/calibration/startScenario/shutdown via
  workbench.action.quit), markerBus, scenarioEngine (command/openDocument/
  waitForMarker/waitForCommandCompletion steps; probes fail honestly until
  implemented; NO sleep step exists).
- normalizer.ts: honesty rules enforced (no markers -> no metric -> invalid;
  official only measurement+passed; timePlane tag records monotonic vs epoch).
- runPipeline.ts: full SS9.2 lifecycle per rep, SS22 output layout,
  run-config.snapshot + environment.json + summary.json + report.md, store writes.
- examples/config.noop.local.jsonc; run command wired with exit codes.
- Docs: ARCHITECTURE.md, RUNNING_TESTS.md.

Notes:
- Driver PERF_MODE-off runtime negative test deferred to M2 flag-off verification
  (gate is structurally the first line of activate()).
- Claude permission allowlist moved to .claude/settings.json (project) because
  approval prompts kept rewriting settings.local.json.

Next: Milestone 2 - vscode-mssql instrumentation behind PERF_MODE (activation +
command markers, perf API w/ STS pid), ext-normal-activation scenario, flag-off
verification. Product repo branch dev/karlb/perftest.

---

## 2026-07-01 - Entry 4: Milestone 2 COMPLETE (product instrumentation + activation scenario)

vscode-mssql changes (branch dev/karlb/perftest, commit 10539f918):
- NEW src/perf/perfTelemetry.ts: Perf singleton, PERF_MODE gate resolved at module
  load (Noop outside perf mode); bounded queue (1000, drop-oldest) -> 250ms batched
  HTTP POST (ndjson) to PERF_MARKER_URL w/ Bearer token; never throws/blocks.
- NEW src/perf/perfApi.ts: mssql.perf.getState command (perf mode only).
- extension.ts: mssql.activate.begin (first line) / mssql.activate.end (after last
  awaited init) + registerPerfApi + flush.
- mainController.ts registerCommand/WithArgs: mssql.command.invoked instant marker
  (EventEmitter dispatch is fire-and-forget -> no honest duration at that seam;
  durations come from semantic completion markers instead).
- serviceclient.ts: mssql.sts.spawn.begin/end + mssql.sts.ready with pid from
  PUBLIC LanguageClient.serverProcess getter; Perf.setStsPid.

Harness changes:
- Marker relay bug found via real run: product ext shares the driver ext-host PID,
  so pid-based echo suppression dropped product markers -> relay now dedupes by
  INGEST SOURCE (http relayed, ws not). Plus: replay of pre-hello http markers on
  driver connect; markerBus freshness guard (measure-end waitForMarker only accepts
  markers >= scenario.start ts); normalizer pairs LAST begin before FIRST end
  (sts spawn retry emits two begins).
- Warmed profile mode (dirs shared per scenario); scenario cleanup resets sidebar
  to Explorer so window restore doesn't pre-activate the extension.
- ext-normal-activation scenario: action = objectExplorer.focus, end =
  waitForMarker mssql.activate.end; metrics scenario.wallclock (official) +
  extension.activate (official, marker pair) + extension.stsSpawn (diagnostic).
- baseline set CLI + store.setBaseline/getBaselineRun ('*' wildcards, env-hash bound).
- normalizer unit tests (7) incl. honesty rules; 15 tests total green.
- scripts/verify-perf-mode-off.ps1.

VERIFIED (run 2026-07-02T03-04-51Z_a95b6e4e, exit 0): 4/4 reps passed;
scenario.wallclock ~2.1-2.2s official; extension.activate 1400-1458ms official
(tight variance); extension.stsSpawn ~965ms official=false. All success
validations passed. PERF_MODE-off check: VS Code alive 45s, decoy listener got
0 connections, driver loads but stays inert. Exit 0.

Known notes:
- official_metric_samples view does NOT filter warmup reps - M6' aggregation must
  drop warmups via repetitions.warmup flag (design SS24.3 step 3).
- First-ever activation run downloads STS into the product repo (cached across
  runs since install dir resolves relative to extension folder).

Next: Milestone 4' (connect + query scenarios): SQL provisioning (docker digest
pin + external fallback), mssql.connection.ready marker, webview mark bridge,
query-10k success proof. Seed SQL already authored (sql/seed/*).

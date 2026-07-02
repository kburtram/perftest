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

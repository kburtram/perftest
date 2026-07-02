# SQL provisioning

How the harness puts SQL Server into a known, deterministic state before
measurement (design §13.4). Implementation:
`packages/perftest-cli/src/sql/sqlProvisioner.ts`; assets under `sql/`.

## Providers

### `dockerCompose` (primary)

`sql/docker-compose.sqlserver.yml` — SQL Server 2022, **pinned by image
digest** (never a floating tag), port `14333`, SA password from
`PERF_SQL_SA_PASSWORD` (synthetic default supplied), seed directory mounted
read-only at `/perf-seed`, container healthcheck via in-container sqlcmd.

Provisioning: `docker compose up -d --wait` → seed scripts applied via
sqlcmd **inside** the container → verify query must return the expected value
or provisioning fails the run (exit 5). The container is reused across runs
(warm-cache default); set `sql.recycleContainer: true` to tear down after.

### `external` (fallback / dev)

Any reachable SQL Server. The ADO.NET connection string comes from the env
var named by `sql.connectionStringEnv` (default `STS2_SQLSERVER_CONNSTRING`).
Supports SQL logins and Windows Integrated auth. Seeding runs through host
`sqlcmd` (works with both classic ODBC sqlcmd and go-sqlcmd; the password
travels in `SQLCMDPASSWORD`, never on a command line).

## Seed (`sql/seed/create-perf-db.sql`, snapshot `seed-v1`)

Fully deterministic, non-sensitive, idempotent (drop + recreate `PerfHarness`):

- `dbo.PerfRows` — exactly 10,000 rows, fixed content (no NEWID/GETDATE),
  fixed-width payload. The query fixture (`sql/seed/query-10k.sql`, also at
  `workspaces/perf/queries/select-10000.sql`) returns exactly these rows.
- OE shape: schemas `sales`/`reporting`, 4 tables, a view, a proc, a
  function, small deterministic data — for Object Explorer expand scenarios.

Every provisioning pass re-applies the seed and then **verifies**
`SELECT COUNT(*) FROM PerfHarness.dbo.PerfRows` returns 10000. No
verification, no run.

## Connection profiles

The provisioner emits a `ConnectionProfileSpec` (server, database, auth type,
credentials) which the orchestrator ships to the driver inside the
`startScenario` payload — profile *names* are logged, contents never. The
driver's `mssqlConnect` step uses it through the product's own test seam
(`mssql.getControllerForTests` → `connectionManager.connect`), so the
measured connection flow is the product's real one.

## Redaction rules (design §29)

- Connection strings and passwords never reach logs, markers, results, or
  SQLite — provisioner log lines carry server host + flags only, and sqlcmd
  error text is regex-redacted before surfacing.
- Perf databases contain synthetic data only. SQL text capture stays off.

## Cache modes

`warm` (default): seed + verify acts as the warmup; buffers stay warm across
reps. `coldDb`/`coldOs` are defined by the design but not implemented yet —
configs asking for them fail honestly rather than mislabeling a warm run.

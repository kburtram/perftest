/**
 * Local SQLite store (design §23). The schema file in @mssqlperf/contracts is
 * the single source of truth; this module only executes it and provides typed
 * insert/query helpers. Raw artifacts stay on the filesystem — only metadata
 * and metrics land here.
 */

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  sqliteSchemaPath,
  type ArtifactRef,
  type GitRepoInfo,
  type Metric,
  type PassType,
  type RepStatus,
  type ValidationRecord,
} from "@mssqlperf/contracts";
import type { HarnessLogger } from "../telemetry/logger";

export interface RunRow {
  runId: string;
  createdAtUnixNs: string;
  passType: PassType;
  status: RepStatus;
  configHash: string;
  configPath?: string;
  outputDir: string;
  environmentHash: string;
  machineId?: string;
  notes?: string;
}

export interface EnvironmentRow {
  environmentHash: string;
  capturedAtUnixNs: string;
  machineId?: string;
  osPlatform?: string;
  osVersion?: string;
  cpuModel?: string;
  logicalCores?: number;
  memoryTotalMb?: number;
  vscodeVersion?: string;
  extensionVersionsJson?: string;
  stsVersion?: string;
  sqlImageDigest?: string;
  sqlSnapshot?: string;
  configFingerprintJson: string;
}

export interface ScenarioRow {
  scenarioId: string;
  displayName: string;
  owner?: string;
  tagsJson?: string;
  definitionHash?: string;
}

export interface RepetitionRow {
  runId: string;
  scenarioId: string;
  repId: number;
  attemptId?: number;
  status: RepStatus;
  warmup: boolean;
  traceId?: string;
  startUnixNs?: string;
  endUnixNs?: string;
  resultPath: string;
}

export class PerfStore {
  private constructor(
    private readonly db: Database.Database,
    private readonly logger: HarnessLogger,
    readonly path: string,
  ) {}

  /** Open (creating if needed) and apply the canonical schema (idempotent). */
  static open(dbPath: string, logger: HarnessLogger): PerfStore {
    const absolute = resolve(dbPath);
    mkdirSync(dirname(absolute), { recursive: true });
    const span = logger.span("store.open", { path: absolute });
    const db = new Database(absolute);
    db.pragma("journal_mode = WAL");
    const schema = readFileSync(sqliteSchemaPath(), "utf8");
    db.exec(schema);
    span.end();
    return new PerfStore(db, logger, absolute);
  }

  tableNames(): string[] {
    const rows = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")
      .all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  insertRun(run: RunRow): void {
    this.db
      .prepare(
        `INSERT INTO runs (run_id, created_at_unix_ns, pass_type, status, config_hash,
           config_path, output_dir, environment_hash, machine_id, notes)
         VALUES (@runId, @createdAtUnixNs, @passType, @status, @configHash,
           @configPath, @outputDir, @environmentHash, @machineId, @notes)`,
      )
      .run({
        configPath: null,
        machineId: null,
        notes: null,
        ...run,
      });
    this.logger.debug("store.insertRun", undefined, { runId: run.runId });
  }

  updateRunStatus(runId: string, status: RepStatus): void {
    this.db.prepare("UPDATE runs SET status = ? WHERE run_id = ?").run(status, runId);
  }

  insertRunRepository(runId: string, repo: GitRepoInfo): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO run_repositories (run_id, repo, sha, branch, dirty, remote)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(runId, repo.repo, repo.sha, repo.branch ?? null, repo.dirty ? 1 : 0, repo.remote ?? null);
  }

  upsertEnvironment(env: EnvironmentRow): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO environments (environment_hash, captured_at_unix_ns, machine_id,
           os_platform, os_version, cpu_model, logical_cores, memory_total_mb, vscode_version,
           extension_versions_json, sts_version, sql_image_digest, sql_snapshot, config_fingerprint_json)
         VALUES (@environmentHash, @capturedAtUnixNs, @machineId, @osPlatform, @osVersion,
           @cpuModel, @logicalCores, @memoryTotalMb, @vscodeVersion, @extensionVersionsJson,
           @stsVersion, @sqlImageDigest, @sqlSnapshot, @configFingerprintJson)`,
      )
      .run({
        machineId: null,
        osPlatform: null,
        osVersion: null,
        cpuModel: null,
        logicalCores: null,
        memoryTotalMb: null,
        vscodeVersion: null,
        extensionVersionsJson: null,
        stsVersion: null,
        sqlImageDigest: null,
        sqlSnapshot: null,
        ...env,
      });
  }

  upsertScenario(s: ScenarioRow): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO scenarios (scenario_id, display_name, owner, tags_json, definition_hash)
         VALUES (@scenarioId, @displayName, @owner, @tagsJson, @definitionHash)`,
      )
      .run({ owner: null, tagsJson: null, definitionHash: null, ...s });
  }

  insertRepetition(rep: RepetitionRow): void {
    this.db
      .prepare(
        `INSERT INTO repetitions (run_id, scenario_id, rep_id, attempt_id, status, warmup,
           trace_id, start_unix_ns, end_unix_ns, result_path)
         VALUES (@runId, @scenarioId, @repId, @attemptId, @status, @warmup,
           @traceId, @startUnixNs, @endUnixNs, @resultPath)`,
      )
      .run({
        attemptId: 0,
        traceId: null,
        startUnixNs: null,
        endUnixNs: null,
        ...rep,
        warmup: rep.warmup ? 1 : 0,
      });
  }

  insertMetrics(
    runId: string,
    scenarioId: string,
    repId: number,
    attemptId: number,
    metrics: Metric[],
  ): void {
    const stmt = this.db.prepare(
      `INSERT INTO metrics (run_id, scenario_id, rep_id, attempt_id, name, value, unit,
         component, process_role, source, official, lower_is_better, aggregation, trace_id,
         span_id, start_unix_ns, end_unix_ns, confidence, tags_json, derivation_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAll = this.db.transaction((items: Metric[]) => {
      for (const m of items) {
        stmt.run(
          runId,
          scenarioId,
          repId,
          attemptId,
          m.name,
          m.value,
          m.unit,
          m.component,
          m.processRole,
          m.source,
          m.official ? 1 : 0,
          m.lowerIsBetter ? 1 : 0,
          m.aggregation ?? null,
          m.traceId ?? null,
          m.spanId ?? null,
          m.startUnixNs ?? null,
          m.endUnixNs ?? null,
          m.confidence ?? null,
          m.tags ? JSON.stringify(m.tags) : null,
          m.derivation ? JSON.stringify(m.derivation) : null,
        );
      }
    });
    insertAll(metrics);
    this.logger.debug("store.insertMetrics", undefined, {
      runId,
      scenarioId,
      repId,
      count: metrics.length,
    });
  }

  insertArtifacts(
    runId: string,
    scenarioId: string | undefined,
    repId: number | undefined,
    attemptId: number,
    artifacts: ArtifactRef[],
    createdAtUnixNs: string,
  ): void {
    const stmt = this.db.prepare(
      `INSERT INTO artifacts (run_id, scenario_id, rep_id, attempt_id, kind, path, retention,
         size_bytes, sha256, content_type, created_at_unix_ns)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const a of artifacts) {
      stmt.run(
        runId,
        scenarioId ?? null,
        repId ?? null,
        attemptId,
        a.kind,
        a.path,
        a.retention ?? "always",
        a.sizeBytes ?? null,
        a.sha256 ?? null,
        a.contentType ?? null,
        createdAtUnixNs,
      );
    }
  }

  insertValidations(
    runId: string,
    scenarioId: string | undefined,
    repId: number | undefined,
    attemptId: number,
    validations: ValidationRecord[],
  ): void {
    const stmt = this.db.prepare(
      `INSERT INTO validations (run_id, scenario_id, rep_id, attempt_id, name, status, message, details_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const v of validations) {
      stmt.run(
        runId,
        scenarioId ?? null,
        repId ?? null,
        attemptId,
        v.name,
        v.status,
        v.message ?? null,
        v.details ? JSON.stringify(v.details) : null,
      );
    }
  }

  /**
   * Mark a run as a named baseline (design §24.3 step 1). Scenario/metric
   * wildcards are stored as '*' (the composite PK cannot hold NULLs
   * meaningfully). The baseline is bound to the run's environment hash.
   */
  setBaseline(
    name: string,
    runId: string,
    options: { scenarioId?: string; metricName?: string; createdBy?: string; notes?: string } = {},
  ): { environmentHash: string } {
    const run = this.db
      .prepare("SELECT run_id, environment_hash FROM runs WHERE run_id = ?")
      .get(runId) as { run_id: string; environment_hash: string } | undefined;
    if (!run) {
      throw new Error(`Run '${runId}' not found in store ${this.path}`);
    }
    this.db
      .prepare(
        `INSERT OR REPLACE INTO baselines
           (baseline_name, scenario_id, metric_name, environment_hash, run_id,
            created_at_unix_ns, created_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        name,
        options.scenarioId ?? "*",
        options.metricName ?? "*",
        run.environment_hash,
        runId,
        (BigInt(Date.now()) * 1_000_000n).toString(),
        options.createdBy ?? null,
        options.notes ?? null,
      );
    this.logger.info("store.baselineSet", undefined, { name, runId });
    return { environmentHash: run.environment_hash };
  }

  /** Resolve a baseline name to its run id (optionally per scenario). */
  getBaselineRun(name: string, scenarioId?: string): { runId: string; environmentHash: string } | undefined {
    const row = this.db
      .prepare(
        `SELECT run_id, environment_hash FROM baselines
         WHERE baseline_name = ? AND scenario_id IN (?, '*')
         ORDER BY CASE scenario_id WHEN '*' THEN 1 ELSE 0 END
         LIMIT 1`,
      )
      .get(name, scenarioId ?? "*") as
      | { run_id: string; environment_hash: string }
      | undefined;
    return row ? { runId: row.run_id, environmentHash: row.environment_hash } : undefined;
  }

  /** Raw prepared access for read paths (reports/regression build on this). */
  query<T>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  close(): void {
    this.db.close();
  }
}

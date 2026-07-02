/**
 * Run pipeline (design §9.2 lifecycle, §22 output layout): for each scenario
 * repetition — provision dirs, start control server + marker sink, launch
 * VS Code unforked, handshake + calibrate, execute the scenario, shut down,
 * normalize to result.json, persist to SQLite, and render the run report.
 */

import { mkdirSync, writeFileSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import {
  newControlToken,
  newSpanId,
  newTraceId,
  nowUnixNs,
  traceparent,
  PerfEnv,
  type ArtifactRef,
  type ConnectionProfileSpec,
  type GitRepoInfo,
  type PerfResult,
  type PassType,
  type ScenarioSpec,
} from "@mssqlperf/contracts";
import { provisionSql } from "../sql/sqlProvisioner";
import { ProcessSamplerCollector } from "../collectors/processSampler";
import { StsEnvelopeJournalCollector } from "../collectors/stsEnvelopeJournal";
import { CdpExtHostProfileCollector } from "../collectors/cdpExtHostProfile";
import { DotnetTraceCollector } from "../collectors/dotnetTrace";
import { WprEtwCollector } from "../collectors/wprEtw";
import type { Collector, CollectorContext, PerfProcess, ProcessRegistry } from "../collectors/types";
import type { LoadedConfig } from "../config/loadConfig";
import { ControlServer } from "../control/controlServer";
import { MarkerSink } from "../markers/markerSink";
import { resolveVscode, type ResolvedVscode } from "../launch/resolveVscode";
import { spawnVscode } from "../launch/spawnVscode";
import {
  captureEnvironment,
  environmentRelevantConfig,
  getGitInfo,
  canonicalJson,
} from "./environment";
import { normalizeRep } from "../normalize/normalizer";
import { renderMarkdownReport } from "../report/markdownReport";
import { renderHtmlReport } from "../report/htmlReport";
import { PerfStore } from "../store/sqliteStore";
import { getScenario } from "../scenarios/registry";
import { ExitCode, type ExitCodeValue } from "../exitCodes";
import type { HarnessLogger } from "../telemetry/logger";

export interface RunOptions {
  loaded: LoadedConfig;
  scenarioFilter?: string;
  passOverride?: PassType;
  logger: HarnessLogger;
  /** Repo root of the perftest monorepo (for driver path + git info). */
  harnessRoot: string;
}

export interface RunSummary {
  runId: string;
  exitCode: ExitCodeValue;
  results: PerfResult[];
  runDir: string;
}

const HELLO_TIMEOUT_MS = 120_000;
const READY_TIMEOUT_MS = 30_000;
const SHUTDOWN_GRACE_MS = 20_000;

export async function executeRun(options: RunOptions): Promise<RunSummary> {
  const { loaded, logger } = options;
  const config = loaded.config;
  const passType = options.passOverride ?? config.passType;
  const runId = loaded.runId;
  const runSpan = logger.span("run", { runId, passType });

  // --- Scenario selection ---------------------------------------------------
  const scenarioIds = config.scenarios.filter(
    (id) => !options.scenarioFilter || id === options.scenarioFilter,
  );
  if (scenarioIds.length === 0) {
    throw new RunConfigError(
      options.scenarioFilter
        ? `--scenario ${options.scenarioFilter} is not in the config's scenario list`
        : "config has no scenarios",
    );
  }
  const specs: ScenarioSpec[] = [];
  for (const id of scenarioIds) {
    const registered = getScenario(id);
    if (!registered) {
      throw new RunConfigError(`Unknown scenario '${id}'`);
    }
    if (!registered.implemented) {
      throw new RunConfigError(
        `Scenario '${id}' is not runnable yet (arrives with ${registered.plannedMilestone})`,
      );
    }
    specs.push(registered.spec);
  }

  // --- Run directory + config snapshot --------------------------------------
  const runDir = resolve(config.output.dir, runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "run-config.snapshot.jsonc"), loaded.rawText, "utf8");

  // --- Resolve VS Code + driver extension -----------------------------------
  const vscodeBuild = await resolveVscode(config.vscode.version, logger.child("launch"));
  const devPaths: string[] = [];
  const extensionVersions: Record<string, string> = {};
  for (const ext of config.vscode.extensions) {
    if (ext.source === "developmentPath") {
      // Relative paths resolve against the current working directory — run
      // perftest from the monorepo root (documented in RUNNING_TESTS.md).
      const extPath = resolve(ext.path);
      const pkgPath = join(extPath, "package.json");
      if (!existsSync(pkgPath)) {
        throw new RunConfigError(`Extension developmentPath has no package.json: ${extPath}`);
      }
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        name: string;
        version: string;
        main?: string;
      };
      const mainFile = pkg.main ? join(extPath, pkg.main.endsWith(".js") ? pkg.main : `${pkg.main}.js`) : undefined;
      if (mainFile && !existsSync(mainFile)) {
        throw new RunConfigError(
          `Extension '${pkg.name}' at ${extPath} is not built (missing ${pkg.main})`,
        );
      }
      devPaths.push(extPath);
      extensionVersions[ext.id] = pkg.version;
    } else {
      throw new RunConfigError(
        `Extension source '${ext.source}' is not supported yet (developmentPath only in M1)`,
      );
    }
  }

  const configFingerprint = environmentRelevantConfig(config);
  const environment = captureEnvironment({
    vscode: vscodeBuild,
    extensionVersions,
    sql: {
      ...(config.sql.imageDigest !== undefined ? { imageDigest: config.sql.imageDigest } : {}),
      snapshot: config.sql.snapshot,
      cacheMode: config.sql.cacheMode,
      provider: config.sql.provider,
    },
    configFingerprint,
    passType,
  });
  writeFileSync(join(runDir, "environment.json"), JSON.stringify(environment, null, 2), "utf8");

  const git: GitRepoInfo[] = [];
  for (const [name, path] of [
    ["perftest", options.harnessRoot],
    ["vscode-mssql", resolve(options.harnessRoot, "..", "vscode-mssql")],
    ["sqltoolsservice", resolve(options.harnessRoot, "..", "sqltoolsservice")],
  ] as const) {
    const info = getGitInfo(path, logger, name);
    if (info) git.push(info);
  }

  // --- Store -----------------------------------------------------------------
  const store =
    config.store.type === "sqlite"
      ? PerfStore.open(resolve(config.store.path ?? "./perf.db"), logger.child("store"))
      : undefined;
  store?.upsertEnvironment({
    environmentHash: environment.environmentHash,
    capturedAtUnixNs: nowUnixNs(),
    machineId: environment.machineId ?? "unknown",
    osPlatform: String((environment.os as Record<string, unknown>)?.["platform"] ?? ""),
    osVersion: String((environment.os as Record<string, unknown>)?.["version"] ?? ""),
    cpuModel: String((environment.cpu as Record<string, unknown>)?.["model"] ?? ""),
    logicalCores: Number((environment.cpu as Record<string, unknown>)?.["logicalCores"] ?? 0),
    memoryTotalMb: Number((environment.memory as Record<string, unknown>)?.["totalMb"] ?? 0),
    vscodeVersion: vscodeBuild.version,
    extensionVersionsJson: JSON.stringify(extensionVersions),
    sqlImageDigest: config.sql.imageDigest ?? "",
    sqlSnapshot: config.sql.snapshot,
    configFingerprintJson: canonicalJson({ config: configFingerprint, passType }),
  });
  store?.insertRun({
    runId,
    createdAtUnixNs: nowUnixNs(),
    passType,
    status: "passed", // updated at the end
    configHash: loaded.configHash,
    configPath: loaded.configPath,
    outputDir: runDir,
    environmentHash: environment.environmentHash,
    machineId: environment.machineId ?? "unknown",
  });
  for (const repo of git) {
    store?.insertRunRepository(runId, repo);
  }

  // --- SQL provisioning (only when a selected scenario needs a connection) ---
  let sqlProfiles: Record<string, ConnectionProfileSpec> | undefined;
  const needsSql = specs.some(
    (s) => s.sql?.connectionProfile && s.sql.connectionProfile !== "none",
  );
  if (needsSql) {
    const provisioned = await provisionSql(config, logger.child("sql"), {
      seedFiles: [resolve("sql", "seed", "create-perf-db.sql")],
      verifyQuery: {
        sql: "SET NOCOUNT ON; SELECT COUNT(*) FROM PerfHarness.dbo.PerfRows",
        expect: "10000",
      },
    });
    sqlProfiles = { default: provisioned.profile };
    logger.info("run.sqlProvisioned", undefined, {
      provider: provisioned.provider,
      validation: provisioned.validation,
    });
  }

  // --- Execute ----------------------------------------------------------------
  const allResults: PerfResult[] = [];
  let infrastructureBroken = false;

  for (const spec of specs) {
    store?.upsertScenario({
      scenarioId: spec.scenarioId,
      displayName: spec.displayName,
      tagsJson: JSON.stringify(spec.tags ?? []),
    });
    const totalReps = config.warmupRepetitions + config.repetitions;
    for (let repId = 0; repId < totalReps; repId++) {
      const warmup = repId < config.warmupRepetitions;
      const repResult = await executeRep({
        runId,
        repId,
        spec,
        passType,
        warmup,
        runDir,
        vscodeBuild,
        devPaths,
        environment,
        git,
        config,
        ...(sqlProfiles ? { sqlProfiles } : {}),
        logger: logger.child("rep"),
      });
      allResults.push(repResult.result);
      if (store) {
        persistRep(store, runId, spec.scenarioId, repId, warmup, repResult.result);
      }
      if (repResult.infrastructureBroken) {
        infrastructureBroken = true;
        logger.error("run.abort", "infrastructure failure - aborting remaining reps");
        break;
      }
    }
    if (infrastructureBroken) break;
  }

  // --- Summarize ----------------------------------------------------------------
  const passed = allResults.filter((r) => r.status === "passed").length;
  const failed = allResults.filter((r) => r.status === "failed").length;
  const runStatus: "passed" | "failed" | "invalid" =
    passed > 0 && failed === 0 ? "passed" : failed > 0 ? "failed" : "invalid";
  store?.updateRunStatus(runId, runStatus);
  store?.close();

  const summary = {
    runId,
    passType,
    status: runStatus,
    environmentHash: environment.environmentHash,
    scenarios: Object.fromEntries(
      specs.map((s) => [
        s.scenarioId,
        {
          reps: allResults
            .filter((r) => r.scenarioId === s.scenarioId)
            .map((r) => ({
              repId: r.repId,
              status: r.status,
              wallclockMs: r.metrics.find((m) => m.name === "scenario.wallclock")?.value ?? null,
            })),
        },
      ]),
    ),
  };
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

  const report = renderMarkdownReport({
    runId,
    passType,
    createdAt: new Date().toISOString(),
    environmentHash: environment.environmentHash,
    ...(environment.machineId !== undefined ? { machineId: environment.machineId } : {}),
    vscodeVersion: vscodeBuild.version,
    results: allResults,
    harnessLogPath: "harness-log.jsonl",
  });
  writeFileSync(join(runDir, "report.md"), report, "utf8");
  writeFileSync(
    join(runDir, "report.html"),
    renderHtmlReport({
      runId,
      passType,
      createdAt: new Date().toISOString(),
      environmentHash: environment.environmentHash,
      ...(environment.machineId !== undefined ? { machineId: environment.machineId } : {}),
      vscodeVersion: vscodeBuild.version,
      results: allResults,
    }),
    "utf8",
  );

  const exitCode: ExitCodeValue = infrastructureBroken
    ? ExitCode.infrastructureFailure
    : failed > 0
      ? ExitCode.scenarioFailed
      : passed === 0
        ? ExitCode.insufficientSamples
        : ExitCode.ok;

  runSpan.end({ status: runStatus, passed, failed, total: allResults.length, exitCode });
  return { runId, exitCode, results: allResults, runDir };
}

export class RunConfigError extends Error {}

/** Minimal §15 process registry: self-reports beat tree heuristics. */
class SimpleProcessRegistry implements ProcessRegistry {
  private readonly processes = new Map<number, PerfProcess>();
  all(): PerfProcess[] {
    return [...this.processes.values()];
  }
  byRole(role: string): PerfProcess[] {
    return this.all().filter((p) => p.role === role);
  }
  register(process: PerfProcess): void {
    this.processes.set(process.pid, process);
  }
}

/** Instantiate the collectors enabled by config for this pass (design §14). */
function createCollectors(
  config: LoadedConfig["config"],
  passType: PassType,
): Collector[] {
  const collectors: Collector[] = [];
  if (config.diagnostics.processSampler) {
    collectors.push(new ProcessSamplerCollector());
  }
  if (config.diagnostics["stsEnvelopeJournal"] === true) {
    collectors.push(new StsEnvelopeJournalCollector());
  }
  if (config.diagnostics.cdp?.extHostProfile === true) {
    collectors.push(new CdpExtHostProfileCollector());
  }
  if (config.diagnostics.dotnetTrace === true) {
    collectors.push(new DotnetTraceCollector());
  }
  if (config.diagnostics.wprEtw === true) {
    collectors.push(new WprEtwCollector());
  }
  return collectors.filter(
    (c) =>
      c.allowedPassTypes.includes(passType) &&
      (c.platforms.includes("all") ||
        c.platforms.includes(process.platform as "win32" | "linux" | "darwin")),
  );
}

/** Run one collector hook with fault isolation (§A3.6). */
async function collectorHook(
  logger: HarnessLogger,
  collector: Collector,
  hook: string,
  fn: () => Promise<unknown> | undefined,
): Promise<unknown> {
  try {
    return await fn();
  } catch (error) {
    logger.warn("collector.hookFailed", String(error), { collector: collector.name, hook });
    return undefined;
  }
}

// -----------------------------------------------------------------------------

interface RepExecutionInputs {
  runId: string;
  repId: number;
  spec: ScenarioSpec;
  passType: PassType;
  warmup: boolean;
  runDir: string;
  vscodeBuild: ResolvedVscode;
  devPaths: string[];
  environment: ReturnType<typeof captureEnvironment>;
  git: GitRepoInfo[];
  config: LoadedConfig["config"];
  sqlProfiles?: Record<string, ConnectionProfileSpec>;
  logger: HarnessLogger;
}

async function executeRep(
  inputs: RepExecutionInputs,
): Promise<{ result: PerfResult; infrastructureBroken: boolean }> {
  const { runId, repId, spec, logger } = inputs;
  const repDir = join(
    inputs.runDir,
    "scenarios",
    spec.scenarioId,
    "reps",
    `rep-${String(repId).padStart(2, "0")}`,
  );
  const artifactsDir = join(repDir, "artifacts");
  mkdirSync(artifactsDir, { recursive: true });

  const repSpan = logger.span("rep", { scenarioId: spec.scenarioId, repId, warmup: inputs.warmup });
  const traceId = newTraceId();
  const rootTraceparent = traceparent(traceId, newSpanId());
  const token = newControlToken();

  // Profile mode (design §13.2): fresh = new dirs per rep; warmed = dirs
  // shared across the scenario's reps (rep 0 / warmups warm the caches).
  const warmedProfile = spec.profileMode === "warmed";
  const profileRoot = warmedProfile
    ? join(inputs.runDir, "scenarios", spec.scenarioId, "profile")
    : repDir;
  const userDataDir = join(profileRoot, "vscode-user-data");
  const extensionsDir = join(profileRoot, "vscode-extensions");

  const sink = new MarkerSink(join(repDir, "markers.jsonl"), logger.child("markerSink"));
  const server = await ControlServer.start({
    token,
    runId,
    repId,
    scenarioId: spec.scenarioId,
    sink,
    logger: logger.child("controlServer"),
  });

  let infrastructureError: string | undefined;
  let outcome;
  let calibration;
  let launched;
  let infrastructureBroken = false;

  // Collector framework (design §14): per-rep instances, fault-isolated.
  const collectors = createCollectors(inputs.config, inputs.passType);
  const processRegistry = new SimpleProcessRegistry();
  const collectorCtx: CollectorContext = {
    runId,
    repId,
    attemptId: 0,
    scenarioId: spec.scenarioId,
    passType: inputs.passType,
    repDir,
    artifactsDir,
    logger: logger.child("collectors"),
  };
  // STS self-reports its pid through the product marker; register on arrival.
  // Scenario-window collectors (CDP profiler, WPR) key off the scenario
  // boundary markers.
  sink.on("marker", (marker) => {
    if (marker.name === "mssql.sts.ready" && typeof marker.attrs?.["pid"] === "number") {
      const stsProcess: PerfProcess = {
        role: "sts",
        pid: marker.attrs["pid"],
        name: "MicrosoftSqlToolsServiceLayer",
        reportedBy: "vscode-mssql",
        discoveryMethods: ["marker"],
      };
      processRegistry.register(stsProcess);
      for (const collector of collectors) {
        void collectorHook(collectorCtx.logger, collector, "onProcessDiscovered", () =>
          collector.onProcessDiscovered?.(collectorCtx, stsProcess),
        );
      }
    } else if (marker.name === "scenario.start") {
      for (const collector of collectors) {
        void collectorHook(collectorCtx.logger, collector, "onScenarioStart", () =>
          collector.onScenarioStart?.(collectorCtx, marker),
        );
      }
    } else if (marker.name === "scenario.end") {
      for (const collector of collectors) {
        void collectorHook(collectorCtx.logger, collector, "onScenarioEnd", () =>
          collector.onScenarioEnd?.(collectorCtx, marker),
        );
      }
    }
  });

  // Collector validation + launch-spec amendment (§14.2 validate/preLaunch).
  const collectorValidations: import("@mssqlperf/contracts").ValidationRecord[] = [];
  for (const collector of collectors) {
    const checks = (await collectorHook(collectorCtx.logger, collector, "validate", () =>
      collector.validate?.(collectorCtx),
    )) as import("../collectors/types").CollectorValidation[] | undefined;
    for (const check of checks ?? []) {
      collectorValidations.push({
        name: `collector:${collector.name}:${check.name}`,
        status: check.status,
        ...(check.message ? { message: check.message } : {}),
      });
    }
  }
  const launchSpec = { args: [...(inputs.config.vscode.extraArgs ?? [])], env: {} as Record<string, string> };
  for (const collector of collectors) {
    await collectorHook(collectorCtx.logger, collector, "preLaunch", () =>
      collector.preLaunch?.(collectorCtx, launchSpec),
    );
  }

  try {
    launched = spawnVscode(
      {
        executablePath: inputs.vscodeBuild.executablePath,
        userDataDir,
        extensionsDir,
        extensionDevelopmentPaths: inputs.devPaths,
        crashDir: join(artifactsDir, "vscode-crashes"),
        ...(inputs.config.vscode.workspaceRoot
          ? { workspacePath: resolve(inputs.config.vscode.workspaceRoot) }
          : {}),
        ...(launchSpec.args.length > 0 ? { extraArgs: launchSpec.args } : {}),
        env: {
          ...inputs.config.vscode.env,
          ...launchSpec.env,
          [PerfEnv.mode]: "1",
          [PerfEnv.runId]: runId,
          [PerfEnv.repId]: String(repId),
          [PerfEnv.scenarioId]: spec.scenarioId,
          [PerfEnv.controlUrl]: server.controlUrl,
          [PerfEnv.controlToken]: token,
          [PerfEnv.markerUrl]: server.markerUrl,
          [PerfEnv.artifactDir]: artifactsDir,
          [PerfEnv.traceparent]: rootTraceparent,
        },
        stdoutPath: join(artifactsDir, "vscode-stdout.log"),
        stderrPath: join(artifactsDir, "vscode-stderr.log"),
      },
      logger.child("launcher"),
    );

    processRegistry.register({
      role: "vscodeMain",
      pid: launched.pid,
      name: "Code",
      reportedBy: "orchestrator",
      discoveryMethods: ["spawn"],
    });
    for (const collector of collectors) {
      await collectorHook(collectorCtx.logger, collector, "postLaunch", () =>
        collector.postLaunch?.(collectorCtx, processRegistry),
      );
    }

    // Handshake: hello → calibration → ready (design §9.2, §11.3).
    const exitEarly = launched.exited.then((code) => {
      throw new Error(`VS Code exited early with code ${code}`);
    });
    const hello = await Promise.race([server.waitForHello(HELLO_TIMEOUT_MS), exitEarly]);
    processRegistry.register({
      role: "extensionHost",
      pid: hello.payload.extensionHostPid,
      name: "extensionHost",
      reportedBy: "mssql-perf-driver",
      discoveryMethods: ["hello"],
    });
    calibration = await server.calibrate();
    await Promise.race([server.waitForReady(READY_TIMEOUT_MS), exitEarly]);

    server.startScenario(spec, traceId, rootTraceparent, artifactsDir, inputs.sqlProfiles);
    const outcomeTimeout = spec.measure.timeoutMs + 30_000;
    outcome = await Promise.race([server.waitForScenarioOutcome(outcomeTimeout), exitEarly]);
  } catch (error) {
    infrastructureError = error instanceof Error ? error.message : String(error);
    // A scenario timeout is a scenario problem; anything before the
    // handshake completes is an infrastructure problem worth aborting on.
    infrastructureBroken = !server.hello;
    logger.error("rep.brokenLoop", infrastructureError, { scenarioId: spec.scenarioId, repId });
  } finally {
    for (const collector of collectors) {
      await collectorHook(collectorCtx.logger, collector, "preShutdown", () =>
        collector.preShutdown?.(collectorCtx),
      );
    }
    try {
      server.sendShutdown("rep complete");
      const exitCode = await launched?.waitForExit(SHUTDOWN_GRACE_MS);
      if (exitCode === undefined && launched) {
        await launched.killTree();
        await launched.waitForExit(5000);
      }
    } catch (error) {
      logger.warn("rep.shutdownError", String(error));
    }
    await server.close();
    await sink.close();
  }

  // Collector artifacts + resource metrics (always official:false / resource-only).
  const collectorArtifacts: ArtifactRef[] = [];
  const collectorMetrics: import("@mssqlperf/contracts").Metric[] = [];
  for (const collector of collectors) {
    const artifacts = (await collectorHook(collectorCtx.logger, collector, "postExit", () =>
      collector.postExit?.(collectorCtx),
    )) as ArtifactRef[] | undefined;
    if (artifacts) collectorArtifacts.push(...artifacts);
    const metrics = (await collectorHook(collectorCtx.logger, collector, "normalize", () =>
      collector.normalize?.(collectorCtx),
    )) as import("@mssqlperf/contracts").Metric[] | undefined;
    if (metrics) collectorMetrics.push(...metrics.filter((m) => !m.official));
    await collectorHook(collectorCtx.logger, collector, "teardown", () =>
      collector.teardown?.(collectorCtx),
    );
  }

  const artifacts: ArtifactRef[] = [
    ...collectorArtifacts,
    { kind: "markers", path: "markers.jsonl", retention: "always", ...sizeOf(join(repDir, "markers.jsonl")) },
    {
      kind: "vscodeStdout",
      path: "artifacts/vscode-stdout.log",
      retention: "on-failure",
      ...sizeOf(join(artifactsDir, "vscode-stdout.log")),
    },
    {
      kind: "vscodeStderr",
      path: "artifacts/vscode-stderr.log",
      retention: "on-failure",
      ...sizeOf(join(artifactsDir, "vscode-stderr.log")),
    },
  ];

  const result = normalizeRep({
    runId,
    repId,
    attemptId: 0,
    scenarioId: spec.scenarioId,
    passType: inputs.passType,
    traceId,
    rootTraceparent,
    markers: sink.all(),
    markersRejected: sink.rejected,
    outcome,
    ...(infrastructureError !== undefined ? { infrastructureError } : {}),
    ...(calibration !== undefined ? { calibration } : {}),
    environment: inputs.environment,
    git: inputs.git,
    artifacts,
    spec,
    extraMetrics: collectorMetrics,
    extraValidations: collectorValidations,
  });
  writeFileSync(join(repDir, "result.json"), JSON.stringify(result, null, 2), "utf8");
  repSpan.end({ status: result.status });
  return { result, infrastructureBroken };
}

function sizeOf(path: string): { sizeBytes?: number } {
  try {
    return { sizeBytes: statSync(path).size };
  } catch {
    return {};
  }
}

function persistRep(
  store: PerfStore,
  runId: string,
  scenarioId: string,
  repId: number,
  warmup: boolean,
  result: PerfResult,
): void {
  const start = result.metrics.find((m) => m.name === "scenario.wallclock")?.startUnixNs;
  const end = result.metrics.find((m) => m.name === "scenario.wallclock")?.endUnixNs;
  store.insertRepetition({
    runId,
    scenarioId,
    repId,
    attemptId: result.attemptId ?? 0,
    status: result.status,
    warmup,
    traceId: result.trace.traceId,
    ...(start !== undefined ? { startUnixNs: start } : {}),
    ...(end !== undefined ? { endUnixNs: end } : {}),
    resultPath: `scenarios/${scenarioId}/reps/rep-${String(repId).padStart(2, "0")}/result.json`,
  });
  store.insertMetrics(runId, scenarioId, repId, result.attemptId ?? 0, result.metrics);
  store.insertArtifacts(runId, scenarioId, repId, result.attemptId ?? 0, result.artifacts, nowUnixNs());
  store.insertValidations(runId, scenarioId, repId, result.attemptId ?? 0, result.validations);
}

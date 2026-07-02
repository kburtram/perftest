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
  type GitRepoInfo,
  type PerfResult,
  type PassType,
  type ScenarioSpec,
} from "@mssqlperf/contracts";
import type { LoadedConfig } from "../config/loadConfig";
import { ControlServer } from "../control/controlServer";
import { MarkerSink } from "../markers/markerSink";
import { resolveVscode, type ResolvedVscode } from "../launch/resolveVscode";
import { spawnVscode } from "../launch/spawnVscode";
import { captureEnvironment, getGitInfo, canonicalJson } from "./environment";
import { normalizeRep } from "../normalize/normalizer";
import { renderMarkdownReport } from "../report/markdownReport";
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

  const environment = captureEnvironment({
    vscode: vscodeBuild,
    extensionVersions,
    sql: {
      ...(config.sql.imageDigest !== undefined ? { imageDigest: config.sql.imageDigest } : {}),
      snapshot: config.sql.snapshot,
      cacheMode: config.sql.cacheMode,
      provider: config.sql.provider,
    },
    configHash: loaded.configHash,
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
    configFingerprintJson: canonicalJson({ configHash: loaded.configHash, passType }),
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

  try {
    launched = spawnVscode(
      {
        executablePath: inputs.vscodeBuild.executablePath,
        userDataDir: join(repDir, "vscode-user-data"),
        extensionsDir: join(repDir, "vscode-extensions"),
        extensionDevelopmentPaths: inputs.devPaths,
        crashDir: join(artifactsDir, "vscode-crashes"),
        ...(inputs.config.vscode.workspaceRoot
          ? { workspacePath: resolve(inputs.config.vscode.workspaceRoot) }
          : {}),
        ...(inputs.config.vscode.extraArgs ? { extraArgs: inputs.config.vscode.extraArgs } : {}),
        env: {
          ...inputs.config.vscode.env,
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

    // Handshake: hello → calibration → ready (design §9.2, §11.3).
    const exitEarly = launched.exited.then((code) => {
      throw new Error(`VS Code exited early with code ${code}`);
    });
    await Promise.race([server.waitForHello(HELLO_TIMEOUT_MS), exitEarly]);
    calibration = await server.calibrate();
    await Promise.race([server.waitForReady(READY_TIMEOUT_MS), exitEarly]);

    server.startScenario(spec, traceId, rootTraceparent, artifactsDir);
    const outcomeTimeout = spec.measure.timeoutMs + 30_000;
    outcome = await Promise.race([server.waitForScenarioOutcome(outcomeTimeout), exitEarly]);
  } catch (error) {
    infrastructureError = error instanceof Error ? error.message : String(error);
    // A scenario timeout is a scenario problem; anything before the
    // handshake completes is an infrastructure problem worth aborting on.
    infrastructureBroken = !server.hello;
    logger.error("rep.brokenLoop", infrastructureError, { scenarioId: spec.scenarioId, repId });
  } finally {
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

  const artifacts: ArtifactRef[] = [
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

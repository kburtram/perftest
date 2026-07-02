#!/usr/bin/env node
/**
 * perftest CLI (design §26). Command surface and exit codes are the public
 * contract; commands whose pipelines land in later milestones exit with a
 * clear "not implemented" message and ExitCode.infrastructureFailure rather
 * than pretending to run.
 */

import { Command } from "commander";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { validateContract, type ContractName, type PassType } from "@mssqlperf/contracts";
import { ExitCode } from "./exitCodes";
import { createRootLogger, JsonlFileSink } from "./telemetry/logger";
import { loadConfig, ConfigError, parseJsoncStrict } from "./config/loadConfig";
import { runDoctor, formatDoctorReport } from "./doctor/doctor";
import { PerfStore } from "./store/sqliteStore";
import { listScenarios } from "./scenarios/registry";
import { listCollectors, PLANNED_COLLECTORS } from "./collectors/registry";
import { executeRun, RunConfigError } from "./run/runPipeline";

const { logger, sink } = createRootLogger();
const HARNESS_ROOT = resolve(__dirname, "..", "..", "..");

function exit(code: number): never {
  process.exit(code);
}

function notImplemented(command: string, milestone: string): never {
  process.stderr.write(
    `perftest ${command} is not implemented yet - it arrives with ${milestone}.\n` +
      `Nothing was executed and no data was written.\n`,
  );
  exit(ExitCode.infrastructureFailure);
}

const program = new Command();
program
  .name("perftest")
  .description("Local-first deterministic perf harness for MSSQL VS Code + SQL Tools Service")
  .version("0.1.0");

// ---------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------
program
  .command("doctor")
  .description("Run environment preflight checks and report machine status")
  .option("--json", "emit the report as JSON")
  .option("--config <path>", "config file to validate alongside the environment")
  .action((opts: { json?: boolean; config?: string }) => {
    const report = runDoctor(logger.child("doctor"));
    if (opts.config) {
      try {
        loadConfig(opts.config);
        report.checks.push({
          name: "configValid",
          status: "passed",
          message: `${opts.config} validates against perf-config schema`,
        });
      } catch (error) {
        report.checks.push({
          name: "configValid",
          status: "failed",
          message: error instanceof ConfigError ? error.message : String(error),
        });
        report.status = "failed";
      }
    }
    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else {
      process.stdout.write(formatDoctorReport(report) + "\n");
    }
    exit(report.status === "failed" ? ExitCode.preflightFailed : ExitCode.ok);
  });

// ---------------------------------------------------------------------------
// schema validate
// ---------------------------------------------------------------------------
program
  .command("schema")
  .description("Contract schema operations")
  .command("validate <file>")
  .description("Validate a JSON/JSONC file against a perf contract schema")
  .option(
    "--contract <name>",
    "contract to validate against: marker | perf-config | perf-result (default: auto-detect)",
  )
  .action((file: string, opts: { contract?: ContractName }) => {
    if (!existsSync(file)) {
      process.stderr.write(`File not found: ${file}\n`);
      exit(ExitCode.configInvalid);
    }
    let data: unknown;
    try {
      data = parseJsoncStrict(readFileSync(file, "utf8"), file);
    } catch (error) {
      process.stderr.write(
        error instanceof ConfigError
          ? `${error.message}\n${error.details.join("\n")}\n`
          : `${String(error)}\n`,
      );
      exit(ExitCode.configInvalid);
    }

    const detect = (): ContractName => {
      if (opts.contract) return opts.contract;
      const obj = data as Record<string, unknown>;
      if (obj && typeof obj === "object") {
        if ("phase" in obj && "process" in obj) return "marker";
        if ("metrics" in obj && "status" in obj) return "perf-result";
        if ("scenarios" in obj && "vscode" in obj) return "perf-config";
      }
      return "perf-config";
    };

    const contract = detect();
    const outcome = validateContract(contract, data);
    if (outcome.valid) {
      process.stdout.write(`VALID: ${file} conforms to the ${contract} schema\n`);
      exit(ExitCode.ok);
    }
    process.stderr.write(`INVALID: ${file} does not conform to the ${contract} schema:\n`);
    for (const err of outcome.errors) {
      process.stderr.write(`  - ${err}\n`);
    }
    exit(ExitCode.configInvalid);
  });

// ---------------------------------------------------------------------------
// scenarios / collectors
// ---------------------------------------------------------------------------
program
  .command("scenarios")
  .description("Scenario operations")
  .command("list")
  .description("List registered scenarios and their implementation status")
  .action(() => {
    const scenarios = listScenarios();
    process.stdout.write("Scenario                     Status        Official metric\n");
    process.stdout.write("---------------------------- ------------- -----------------------\n");
    for (const s of scenarios) {
      const status = s.implemented ? "implemented" : `planned (${s.plannedMilestone})`;
      const official =
        s.spec.metrics?.filter((m) => m.official).map((m) => m.name).join(", ") ?? "";
      process.stdout.write(
        `${s.spec.scenarioId.padEnd(28)} ${status.padEnd(13)} ${official}\n`,
      );
    }
    exit(ExitCode.ok);
  });

program
  .command("collectors")
  .description("Collector operations")
  .command("list")
  .description("List registered collectors (implemented) and the planned catalog")
  .action(() => {
    const implemented = listCollectors();
    if (implemented.length === 0) {
      process.stdout.write("No collectors implemented yet.\n");
    } else {
      process.stdout.write("Implemented collectors:\n");
      for (const c of implemented) {
        process.stdout.write(
          `  ${c.name.padEnd(24)} cost=${c.cost} passes=${c.allowedPassTypes.join(",")}\n`,
        );
      }
    }
    const implementedNames = new Set(implemented.map((c) => c.name));
    const planned = PLANNED_COLLECTORS.filter((p) => !implementedNames.has(p.name));
    if (planned.length > 0) {
      process.stdout.write("Planned (design §14.3):\n");
      for (const p of planned) {
        process.stdout.write(`  ${p.name.padEnd(24)} arrives ${p.milestone}\n`);
      }
    }
    exit(ExitCode.ok);
  });

// ---------------------------------------------------------------------------
// store init (explicit helper; run also initializes on demand)
// ---------------------------------------------------------------------------
program
  .command("store")
  .description("Local store operations")
  .command("init")
  .description("Initialize (or migrate) the local SQLite store from the canonical schema")
  .option("--db <path>", "database path", "./perf.db")
  .action((opts: { db: string }) => {
    const store = PerfStore.open(opts.db, logger.child("store"));
    const tables = store.tableNames();
    store.close();
    process.stdout.write(
      `Store initialized at ${store.path}\nTables/views (${tables.length}): ${tables.join(", ")}\n`,
    );
    exit(ExitCode.ok);
  });

// ---------------------------------------------------------------------------
// run / report / compare / baseline / cleanup — pipelines land in M1/M6'
// ---------------------------------------------------------------------------
program
  .command("run")
  .description("Execute a perf run")
  .requiredOption("--config <path>", "perf config file (jsonc)")
  .option("--scenario <id>", "run a single scenario")
  .option("--pass <type>", "override pass type: measurement | diagnostic | calibration")
  .action(async (opts: { config: string; scenario?: string; pass?: string }) => {
    if (opts.pass && !["measurement", "diagnostic", "calibration"].includes(opts.pass)) {
      process.stderr.write(`Invalid --pass '${opts.pass}'\n`);
      exit(ExitCode.configInvalid);
    }
    let loaded;
    try {
      loaded = loadConfig(opts.config);
    } catch (error) {
      if (error instanceof ConfigError) {
        process.stderr.write(`${error.message}\n`);
        for (const d of error.details) process.stderr.write(`  - ${d}\n`);
        exit(ExitCode.configInvalid);
      }
      throw error;
    }

    // From here on, every harness event also lands in the run's JSONL log.
    const runDir = resolve(loaded.config.output.dir, loaded.runId);
    mkdirSync(runDir, { recursive: true });
    sink.add(new JsonlFileSink(join(runDir, "harness-log.jsonl")));
    logger.info("run.starting", undefined, {
      runId: loaded.runId,
      configHash: loaded.configHash,
      configPath: loaded.configPath,
    });

    try {
      const summary = await executeRun({
        loaded,
        ...(opts.scenario !== undefined ? { scenarioFilter: opts.scenario } : {}),
        ...(opts.pass !== undefined ? { passOverride: opts.pass as PassType } : {}),
        logger: logger.child("run"),
        harnessRoot: HARNESS_ROOT,
      });
      process.stdout.write(`\nRun: ${summary.runId}\n`);
      for (const result of summary.results) {
        const wallclock = result.metrics.find((m) => m.name === "scenario.wallclock");
        process.stdout.write(
          `  ${result.scenarioId} rep ${result.repId}: ${result.status}` +
            (wallclock
              ? ` scenario.wallclock=${wallclock.value.toFixed(1)}ms (official=${wallclock.official})`
              : " (no wallclock)") +
            "\n",
        );
      }
      process.stdout.write(`Report: ${join(summary.runDir, "report.md")}\n`);
      exit(summary.exitCode);
    } catch (error) {
      if (error instanceof RunConfigError) {
        process.stderr.write(`${error.message}\n`);
        exit(ExitCode.configInvalid);
      }
      logger.error("run.failed", error instanceof Error ? (error.stack ?? error.message) : String(error));
      exit(ExitCode.infrastructureFailure);
    }
  });

program
  .command("report <runId>")
  .description("Render the report for a run (Milestone 1+)")
  .option("--open", "open the HTML report")
  .action(() => notImplemented("report", "Milestone 1"));

program
  .command("compare")
  .description("Compare a run against a baseline (Milestone 6')")
  .requiredOption("--current <runId>")
  .requiredOption("--baseline <runIdOrTag>")
  .action(() => notImplemented("compare", "Milestone 6'"));

const baseline = program.command("baseline").description("Baseline management (Milestone 6')");
baseline
  .command("set <name> <runId>")
  .description("Mark a run as a named baseline")
  .action(() => notImplemented("baseline set", "Milestone 6'"));

program
  .command("cleanup")
  .description("Apply artifact retention policy (Milestone 6')")
  .option("--older-than <duration>", "e.g. 30d")
  .option("--keep-regressions", "never delete artifacts of regressed runs")
  .action(() => notImplemented("cleanup", "Milestone 6'"));

program.parseAsync(process.argv).catch((error: unknown) => {
  logger.error("cli.unhandled", error instanceof Error ? error.stack : String(error));
  exit(ExitCode.infrastructureFailure);
});

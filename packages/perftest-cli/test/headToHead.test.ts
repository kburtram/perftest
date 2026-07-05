import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PerfStore } from "../src/store/sqliteStore";
import { HarnessLogger, MemorySink } from "../src/telemetry/logger";
import {
  headToHead,
  renderHeadToHeadConsole,
  HeadToHeadError,
  DEFAULT_BASELINE_SCENARIO,
  DEFAULT_CANDIDATE_SCENARIO,
} from "../src/regression/headToHead";
import { renderHeadToHeadHtml } from "../src/report/headToHeadReport";

function tempStore(): { store: PerfStore; dir: string; logger: HarnessLogger } {
  const dir = mkdtempSync(join(tmpdir(), "h2h-"));
  const logger = new HarnessLogger("test", new MemorySink());
  const store = PerfStore.open(join(dir, "perf.db"), logger);
  return { store, dir, logger };
}

interface SeedSpec {
  runId: string;
  createdAtUnixNs: string;
  scenarioId: string;
  environmentHash?: string;
  repStatus?: "passed" | "failed";
  /** One official scenario.wallclock sample per rep. */
  wallclock: number[];
  /** Extra warmup rep (excluded from aggregates) with this wallclock value. */
  warmupWallclock?: number;
  diagnostics?: Array<{ name: string; values: number[]; timePlane?: string }>;
}

function seedRun(store: PerfStore, spec: SeedSpec): void {
  const env = spec.environmentHash ?? "sha256:env-a";
  store.upsertEnvironment({
    environmentHash: env,
    capturedAtUnixNs: spec.createdAtUnixNs,
    configFingerprintJson: "{}",
  });
  if (!store.getRun(spec.runId)) {
    store.insertRun({
      runId: spec.runId,
      createdAtUnixNs: spec.createdAtUnixNs,
      passType: "measurement",
      status: "passed",
      configHash: "sha256:cfg",
      outputDir: `perf-runs/${spec.runId}`,
      environmentHash: env,
    });
  }
  store.upsertScenario({ scenarioId: spec.scenarioId, displayName: spec.scenarioId });
  const repCount = spec.wallclock.length + (spec.warmupWallclock !== undefined ? 1 : 0);
  for (let rep = 0; rep < repCount; rep++) {
    const warmup = spec.warmupWallclock !== undefined && rep === 0;
    const measuredIndex = spec.warmupWallclock !== undefined ? rep - 1 : rep;
    store.insertRepetition({
      runId: spec.runId,
      scenarioId: spec.scenarioId,
      repId: rep,
      status: spec.repStatus ?? "passed",
      warmup,
      resultPath: `scenarios/${spec.scenarioId}/reps/rep-${rep}/result.json`,
    });
    const wallclock = warmup ? spec.warmupWallclock! : spec.wallclock[measuredIndex]!;
    store.insertMetrics(spec.runId, spec.scenarioId, rep, 0, [
      {
        name: "scenario.wallclock",
        value: wallclock,
        unit: "ms",
        component: "scenario",
        processRole: "boundary",
        source: "marker",
        official: true,
        lowerIsBetter: true,
      },
      ...(warmup
        ? []
        : (spec.diagnostics ?? []).map((d) => ({
            name: d.name,
            value: d.values[measuredIndex]!,
            unit: "ms",
            component: "query",
            processRole: "extensionHost",
            source: "marker" as const,
            official: false,
            lowerIsBetter: true,
            ...(d.timePlane ? { tags: { timePlane: d.timePlane } } : {}),
          }))),
    ]);
  }
}

const T1 = "1700000001000000000";
const T2 = "1700000002000000000";
const T3 = "1700000003000000000";

describe("headToHead", () => {
  it("selects each scenario's most recent official-passing run (failed/warmup excluded)", () => {
    const { store, dir, logger } = tempStore();
    try {
      seedRun(store, {
        runId: "base-old",
        createdAtUnixNs: T1,
        scenarioId: DEFAULT_BASELINE_SCENARIO,
        wallclock: [100],
      });
      seedRun(store, {
        runId: "base-new",
        createdAtUnixNs: T2,
        scenarioId: DEFAULT_BASELINE_SCENARIO,
        wallclock: [110, 112, 114],
        warmupWallclock: 9999, // warmup rep must not move the median
      });
      // Newest run exists but its reps FAILED — must not be selected.
      seedRun(store, {
        runId: "base-broken",
        createdAtUnixNs: T3,
        scenarioId: DEFAULT_BASELINE_SCENARIO,
        repStatus: "failed",
        wallclock: [999],
      });
      seedRun(store, {
        runId: "cand-1",
        createdAtUnixNs: T2,
        scenarioId: DEFAULT_CANDIDATE_SCENARIO,
        wallclock: [200, 210, 220],
      });

      const report = headToHead(store, logger);
      expect(report.baseline.runId).toBe("base-new");
      expect(report.candidate.runId).toBe("cand-1");

      const wallclock = report.official.find((m) => m.metric === "scenario.wallclock")!;
      expect(wallclock.baseline!.median).toBeCloseTo(112);
      expect(wallclock.baseline!.samples).toBe(3);
      expect(wallclock.candidate!.median).toBeCloseTo(210);
      expect(wallclock.deltaAbs).toBeCloseTo(98);
      expect(wallclock.deltaPct).toBeCloseTo((98 / 112) * 100, 3);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("maps shared marker semantics across differently-named metric families", () => {
    const { store, dir, logger } = tempStore();
    try {
      seedRun(store, {
        runId: "base",
        createdAtUnixNs: T1,
        scenarioId: DEFAULT_BASELINE_SCENARIO,
        wallclock: [100, 100, 100],
        diagnostics: [
          { name: "mssql.query.toComplete", values: [80, 90, 100], timePlane: "monotonic" },
          { name: "mssql.query.toRender", values: [90, 100, 110], timePlane: "epoch" },
        ],
      });
      seedRun(store, {
        runId: "cand",
        createdAtUnixNs: T1,
        scenarioId: DEFAULT_CANDIDATE_SCENARIO,
        wallclock: [200, 200, 200],
        diagnostics: [
          {
            name: "mssql.queryStudio.query.toComplete",
            values: [150, 160, 170],
            timePlane: "monotonic",
          },
          {
            name: "mssql.queryStudio.query.toRender",
            values: [160, 170, 180],
            timePlane: "epoch",
          },
        ],
      });

      const report = headToHead(store, logger);
      expect(report.phases).toHaveLength(2);

      const toComplete = report.phases.find((p) => p.phase === "submit → complete")!;
      expect(toComplete.baselineMetric).toBe("mssql.query.toComplete");
      expect(toComplete.candidateMetric).toBe("mssql.queryStudio.query.toComplete");
      expect(toComplete.baseline!.median).toBeCloseTo(90);
      expect(toComplete.candidate!.median).toBeCloseTo(160);
      expect(toComplete.deltaAbs).toBeCloseTo(70);
      expect(toComplete.baselineTimePlanes).toEqual(["monotonic"]);

      const toRender = report.phases.find((p) => p.phase === "submit → render")!;
      expect(toRender.baselineTimePlanes).toEqual(["epoch"]);
      expect(toRender.candidateTimePlanes).toEqual(["epoch"]);
      // Same plane on both sides — no mixed-plane caveat.
      expect(report.notes.some((n) => n.includes("mixes timing planes"))).toBe(false);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps a one-sided phase and records the missing side honestly", () => {
    const { store, dir, logger } = tempStore();
    try {
      seedRun(store, {
        runId: "base",
        createdAtUnixNs: T1,
        scenarioId: DEFAULT_BASELINE_SCENARIO,
        wallclock: [100],
        diagnostics: [
          { name: "mssql.query.toComplete", values: [80] },
          { name: "mssql.query.toRender", values: [90] },
        ],
      });
      seedRun(store, {
        runId: "cand",
        createdAtUnixNs: T1,
        scenarioId: DEFAULT_CANDIDATE_SCENARIO,
        wallclock: [200],
        diagnostics: [{ name: "mssql.queryStudio.query.toComplete", values: [150] }],
      });

      const report = headToHead(store, logger);
      const toRender = report.phases.find((p) => p.phase === "submit → render")!;
      expect(toRender.baseline).toBeDefined();
      expect(toRender.candidate).toBeUndefined();
      expect(toRender.deltaAbs).toBeUndefined();
      expect(
        report.notes.some(
          (n) =>
            n.includes("submit → render") &&
            n.includes("mssql.queryStudio.query.toRender") &&
            n.includes("missing on the candidate run"),
        ),
      ).toBe(true);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses honestly when a scenario has no official-passing run", () => {
    const { store, dir, logger } = tempStore();
    try {
      seedRun(store, {
        runId: "base",
        createdAtUnixNs: T1,
        scenarioId: DEFAULT_BASELINE_SCENARIO,
        wallclock: [100],
      });
      expect(() => headToHead(store, logger)).toThrow(HeadToHeadError);
      expect(() => headToHead(store, logger)).toThrow(/querystudio-query-10k/);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("notes environment-hash mismatches between the selected runs", () => {
    const { store, dir, logger } = tempStore();
    try {
      seedRun(store, {
        runId: "base",
        createdAtUnixNs: T1,
        scenarioId: DEFAULT_BASELINE_SCENARIO,
        environmentHash: "sha256:env-a",
        wallclock: [100],
      });
      seedRun(store, {
        runId: "cand",
        createdAtUnixNs: T1,
        scenarioId: DEFAULT_CANDIDATE_SCENARIO,
        environmentHash: "sha256:env-b",
        wallclock: [200],
      });
      const report = headToHead(store, logger);
      expect(report.notes.some((n) => n.includes("Environment hashes differ"))).toBe(true);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("supports arbitrary scenario pairs via options", () => {
    const { store, dir, logger } = tempStore();
    try {
      seedRun(store, { runId: "a", createdAtUnixNs: T1, scenarioId: "noop", wallclock: [1, 2, 3] });
      seedRun(store, {
        runId: "b",
        createdAtUnixNs: T1,
        scenarioId: "noop-synthetic-delay",
        wallclock: [251, 252, 253],
      });
      const report = headToHead(store, logger, {
        baselineScenario: "noop",
        candidateScenario: "noop-synthetic-delay",
      });
      const wallclock = report.official.find((m) => m.metric === "scenario.wallclock")!;
      expect(wallclock.deltaAbs).toBeCloseTo(250);
      // Default phase map metrics absent on both sides → phases skipped w/ note.
      expect(report.phases).toHaveLength(0);
      expect(report.notes.some((n) => n.includes("skipped"))).toBe(true);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("renders console and HTML with the essentials", () => {
    const { store, dir, logger } = tempStore();
    try {
      seedRun(store, {
        runId: "base-run",
        createdAtUnixNs: T1,
        scenarioId: DEFAULT_BASELINE_SCENARIO,
        wallclock: [100, 110, 120],
        diagnostics: [
          { name: "mssql.query.toComplete", values: [80, 90, 100], timePlane: "monotonic" },
        ],
      });
      seedRun(store, {
        runId: "cand-run",
        createdAtUnixNs: T1,
        scenarioId: DEFAULT_CANDIDATE_SCENARIO,
        wallclock: [200, 210, 220],
        diagnostics: [
          {
            name: "mssql.queryStudio.query.toComplete",
            values: [150, 160, 170],
            timePlane: "monotonic",
          },
        ],
      });
      const report = headToHead(store, logger);

      const consoleText = renderHeadToHeadConsole(report);
      expect(consoleText).toContain(DEFAULT_BASELINE_SCENARIO);
      expect(consoleText).toContain(DEFAULT_CANDIDATE_SCENARIO);
      expect(consoleText).toContain("scenario.wallclock");
      expect(consoleText).toContain("+100.0 ms");
      expect(consoleText).toContain("3/3");

      const html = renderHeadToHeadHtml(report);
      expect(html).toContain("Head-to-head");
      expect(html).toContain("base-run");
      expect(html).toContain("cand-run");
      expect(html).toContain("non-gating");
      expect(html).toContain("Official metrics");
      expect(html).toContain("Phase breakdown");
      // Shared design system (benchmark.html tokens via htmlShell).
      expect(html).toContain("--panel");
      expect(html).toContain('class="kpis"');
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

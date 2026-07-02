import { describe, expect, it } from "vitest";
import type { Marker, ScenarioSpec } from "@mssqlperf/contracts";
import { normalizeRep, type NormalizeInputs } from "../src/normalize/normalizer";
import type { ScenarioOutcome } from "../src/control/controlServer";

function marker(name: string, overrides: Partial<Marker> = {}): Marker {
  return {
    schemaVersion: 1,
    runId: "run-1",
    repId: 0,
    scenarioId: "test-scenario",
    name,
    phase: "instant",
    timestampUnixNs: "1000000000000000000",
    monotonicNs: "1000000000",
    process: { role: "extensionHost", pid: 42, name: "driver" },
    ...overrides,
  };
}

function completedOutcome(): ScenarioOutcome {
  return {
    kind: "completed",
    completed: {
      schemaVersion: 1,
      kind: "scenarioCompleted",
      runId: "run-1",
      repId: 0,
      scenarioId: "test-scenario",
      timestampUnixNs: "1",
      sender: { role: "automationExtension", pid: 42, name: "driver" },
      payload: { successChecks: [], steps: [] },
    },
  };
}

function baseInputs(overrides: Partial<NormalizeInputs> = {}): NormalizeInputs {
  return {
    runId: "run-1",
    repId: 0,
    attemptId: 0,
    scenarioId: "test-scenario",
    passType: "measurement",
    traceId: "0af7651916cd43dd8448eb211c80319c",
    rootTraceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    markers: [
      marker("scenario.start", { monotonicNs: "1000000000" }),
      marker("scenario.end", { monotonicNs: "1250000000" }),
    ],
    markersRejected: 0,
    outcome: completedOutcome(),
    environment: { environmentHash: "sha256:test" },
    git: [],
    artifacts: [{ kind: "markers", path: "markers.jsonl" }],
    ...overrides,
  };
}

describe("normalizeRep", () => {
  it("derives official wallclock from same-process monotonic markers", () => {
    const result = normalizeRep(baseInputs());
    expect(result.status).toBe("passed");
    const wallclock = result.metrics.find((m) => m.name === "scenario.wallclock");
    expect(wallclock?.value).toBeCloseTo(250);
    expect(wallclock?.official).toBe(true);
    expect(wallclock?.tags?.["timePlane"]).toBe("monotonic");
  });

  it("falls back to the epoch plane across processes and tags it", () => {
    const result = normalizeRep(
      baseInputs({
        markers: [
          marker("scenario.start", { timestampUnixNs: "1000000000000000000" }),
          marker("scenario.end", {
            timestampUnixNs: "1000000000300000000",
            process: { role: "webview", pid: 99, name: "grid" },
          }),
        ],
      }),
    );
    const wallclock = result.metrics.find((m) => m.name === "scenario.wallclock");
    expect(wallclock?.value).toBeCloseTo(300);
    expect(wallclock?.tags?.["timePlane"]).toBe("epoch");
  });

  it("missing required marker => invalid, no wallclock, never a fast number", () => {
    const result = normalizeRep(
      baseInputs({ markers: [marker("scenario.start")] }),
    );
    expect(result.status).toBe("invalid");
    expect(result.metrics.find((m) => m.name === "scenario.wallclock")).toBeUndefined();
    expect(result.metrics.some((m) => m.official)).toBe(false);
    expect(
      result.validations.find((v) => v.name === "requiredMarkersPresent")?.status,
    ).toBe("failed");
  });

  it("scenario failure => failed status and unofficial metrics", () => {
    const result = normalizeRep(
      baseInputs({
        outcome: {
          kind: "failed",
          failed: {
            schemaVersion: 1,
            kind: "scenarioFailed",
            runId: "run-1",
            repId: 0,
            scenarioId: "test-scenario",
            timestampUnixNs: "1",
            sender: { role: "automationExtension", pid: 42, name: "driver" },
            payload: { reason: "success criterion failed: rowCount" },
          },
        },
      }),
    );
    expect(result.status).toBe("failed");
    const wallclock = result.metrics.find((m) => m.name === "scenario.wallclock");
    expect(wallclock).toBeDefined();
    expect(wallclock?.official).toBe(false);
  });

  it("diagnostic pass metrics are never official", () => {
    const result = normalizeRep(baseInputs({ passType: "diagnostic" }));
    expect(result.status).toBe("passed");
    expect(result.metrics.every((m) => !m.official)).toBe(true);
  });

  it("derives declared marker-pair metrics and warns when markers are absent", () => {
    const spec: ScenarioSpec = {
      scenarioId: "test-scenario",
      displayName: "t",
      measure: {
        start: { type: "beforeFirstAction" },
        action: [],
        end: { type: "afterLastAction" },
        timeoutMs: 1000,
      },
      metrics: [
        {
          name: "extension.activate",
          source: "marker",
          official: true,
          beginMarker: "mssql.activate.begin",
          endMarker: "mssql.activate.end",
          component: "extension",
        },
        {
          name: "extension.stsSpawn",
          source: "marker",
          official: false,
          beginMarker: "mssql.sts.spawn.begin",
          endMarker: "mssql.sts.spawn.end",
        },
      ],
    };
    const result = normalizeRep(
      baseInputs({
        spec,
        markers: [
          marker("scenario.start", { monotonicNs: "1000000000" }),
          marker("mssql.activate.begin", { monotonicNs: "1010000000", phase: "begin" }),
          marker("mssql.activate.end", { monotonicNs: "1110000000", phase: "end" }),
          marker("scenario.end", { monotonicNs: "1250000000" }),
        ],
      }),
    );
    const activate = result.metrics.find((m) => m.name === "extension.activate");
    expect(activate?.value).toBeCloseTo(100);
    expect(activate?.official).toBe(true);
    expect(activate?.component).toBe("extension");
    // stsSpawn markers absent: no metric, a warning validation instead.
    expect(result.metrics.find((m) => m.name === "extension.stsSpawn")).toBeUndefined();
    expect(
      result.validations.find((v) => v.name === "metricMarkers:extension.stsSpawn")?.status,
    ).toBe("warning");
  });

  it("infrastructure error => invalid with the error recorded", () => {
    const result = normalizeRep(
      baseInputs({
        markers: [],
        outcome: undefined,
        infrastructureError: "VS Code exited early with code 1",
      }),
    );
    expect(result.status).toBe("invalid");
    expect(result.errors.some((e) => e.kind === "infrastructure")).toBe(true);
  });
});

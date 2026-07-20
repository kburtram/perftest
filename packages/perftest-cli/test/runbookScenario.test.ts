import type { ScenarioSpec } from "@mssqlperf/contracts";
import { describe, expect, it } from "vitest";

import { RunConfigError, validateScenarioWarmups } from "../src/run/runPipeline";
import { getScenario } from "../src/scenarios/registry";

describe("Runbook Studio restart recovery scenario", () => {
  const entry = getScenario("runbook-restart-recovery-fixture");

  it("uses a warmed profile and requires a prior VS Code process", () => {
    expect(entry?.implemented).toBe(true);
    expect(entry?.spec.profileMode).toBe("warmed");
    expect(entry?.spec.minimumWarmupRepetitions).toBe(1);
    expect(entry?.spec.setup).toContainEqual(
      expect.objectContaining({
        type: "activateExtension",
        extensionId: "ms-mssql.mssql",
      }),
    );
    expect(entry?.spec.measure.action).toContainEqual(
      expect.objectContaining({
        type: "command",
        command: "mssql.perf.runbookStudio.restartRecoveryFixture",
      }),
    );
  });

  it("accepts a configuration with a whole-process warmup", () => {
    expect(() => validateScenarioWarmups([entry!.spec], 1)).not.toThrow();
  });

  it("rejects a seed-only configuration with no prior host", () => {
    expect(() => validateScenarioWarmups([entry!.spec], 0)).toThrow(RunConfigError);
  });

  it("does not impose warmups on ordinary scenarios", () => {
    const ordinary: ScenarioSpec = {
      scenarioId: "ordinary",
      displayName: "ordinary",
      measure: {
        start: { type: "beforeFirstAction" },
        action: [],
        end: { type: "afterLastAction" },
        timeoutMs: 1000,
      },
    };
    expect(() => validateScenarioWarmups([ordinary], 0)).not.toThrow();
  });
});

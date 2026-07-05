import { describe, expect, it } from "vitest";
import { explainEventName, isKnownMetricName, loadRegistry } from "@mssqlperf/observability-contracts";

import { getScenario, scenarioMaturity } from "../src/scenarios/registry";

/**
 * querystudio-query-10k must stay the honest twin of the classic gate:
 * same fixture, same provisioning, registered markers only, exploratory
 * maturity until baseline history exists (no enthusiasm promotions).
 */
describe("querystudio-query-10k scenario registration", () => {
  const entry = getScenario("querystudio-query-10k");
  const classic = getScenario("query-10k-results");

  it("is registered, implemented, and exploratory", () => {
    expect(entry).toBeDefined();
    expect(entry!.implemented).toBe(true);
    expect(scenarioMaturity(entry!)).toBe("exploratory");
  });

  it("uses the classic gate's fixture document and SQL provisioning", () => {
    expect(classic).toBeDefined();
    expect(entry!.spec.sql?.database).toBe(classic!.spec.sql?.database);
    expect(entry!.spec.sql?.connectionProfile).toBe(classic!.spec.sql?.connectionProfile);
    const fixtureOf = (steps: Array<{ type: string; path?: string }> | undefined) =>
      steps?.find((s) => s.type === "openDocument")?.path;
    expect(fixtureOf(entry!.spec.setup as never)).toBe(fixtureOf(classic!.spec.setup as never));
  });

  it("waits only on markers registered in the observability contract", () => {
    const registry = loadRegistry();
    const names: string[] = [];
    for (const step of [...(entry!.spec.setup ?? []), ...entry!.spec.measure.action]) {
      if (step.type === "waitForMarker") names.push(step.name);
    }
    if (entry!.spec.measure.end.type === "waitForMarker") {
      names.push(entry!.spec.measure.end.name);
    }
    for (const criterion of entry!.spec.success ?? []) {
      if (criterion.type === "markerSeen") names.push(criterion.name);
    }
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(explainEventName(name, registry).known, `unregistered marker: ${name}`).toBe(true);
    }
  });

  it("derives only registry-declared metrics with the exact registered pairs", () => {
    const registry = loadRegistry();
    const paired = (entry!.spec.metrics ?? []).filter((m) => m.beginMarker && m.endMarker);
    expect(paired.length).toBe(2);
    for (const metric of paired) {
      expect(isKnownMetricName(metric.name, registry), `unregistered metric: ${metric.name}`).toBe(
        true,
      );
      const declared = registry.metrics.find((m) => m.name === metric.name)!;
      expect([metric.beginMarker, metric.endMarker]).toEqual(declared.derivedFrom);
    }
  });

  it("keeps scenario.wallclock as the only official metric (driver plane)", () => {
    const officials = (entry!.spec.metrics ?? []).filter((m) => m.official);
    expect(officials.map((m) => m.name)).toEqual(["scenario.wallclock"]);
  });
});

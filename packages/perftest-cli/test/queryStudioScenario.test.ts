import { describe, expect, it } from "vitest";
import { explainEventName, isKnownMetricName, loadRegistry } from "@mssqlperf/observability-contracts";

import { getScenario, listScenarios, scenarioMaturity } from "../src/scenarios/registry";

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

/**
 * EVERY querystudio-* scenario (including the QO-9a result-shape family and
 * any QO-9b spread expansion) obeys the same conformance rules: registered
 * markers only, registry-declared metric pairs, rows/attrs-guarded measured
 * end (the connect preflight emits the same marker family), and no official
 * metric beyond wallclock while maturity is exploratory.
 */
describe("querystudio scenario family conformance", () => {
  const registry = loadRegistry();
  const family = listScenarios().filter((s) => s.spec.scenarioId.startsWith("querystudio-"));

  it("has the QO-9a result-shape scenarios registered", () => {
    const ids = family.map((s) => s.spec.scenarioId);
    for (const expected of [
      "querystudio-query-100k-narrow",
      "querystudio-query-wide-1000x300",
      "querystudio-query-large-cells",
      "querystudio-query-10k-messages",
      "querystudio-query-100-resultsets",
    ]) {
      expect(ids, `missing scenario: ${expected}`).toContain(expected);
    }
  });

  it.each(family.map((s) => [s.spec.scenarioId, s] as const))(
    "%s waits/asserts only registered markers and derives registered metric pairs",
    (_id, scenario) => {
      const names: string[] = [];
      for (const step of [...(scenario.spec.setup ?? []), ...scenario.spec.measure.action]) {
        if (step.type === "waitForMarker") names.push(step.name);
      }
      if (scenario.spec.measure.end.type === "waitForMarker") {
        names.push(scenario.spec.measure.end.name);
      }
      for (const criterion of scenario.spec.success ?? []) {
        if (criterion.type === "markerSeen") names.push(criterion.name);
      }
      for (const name of names) {
        expect(explainEventName(name, registry).known, `unregistered marker: ${name}`).toBe(true);
      }
      for (const metric of (scenario.spec.metrics ?? []).filter(
        (m) => m.beginMarker && m.endMarker,
      )) {
        expect(
          isKnownMetricName(metric.name, registry),
          `unregistered metric: ${metric.name}`,
        ).toBe(true);
        const declared = registry.metrics.find((m) => m.name === metric.name)!;
        expect([metric.beginMarker, metric.endMarker]).toEqual(declared.derivedFrom);
      }
    },
  );

  it.each(family.map((s) => [s.spec.scenarioId, s] as const))(
    "%s guards its measured end with attrs and stays exploratory-honest on official metrics",
    (_id, scenario) => {
      if (scenario.spec.measure.end.type === "waitForMarker") {
        expect(
          Object.keys(scenario.spec.measure.end.attrs ?? {}).length,
          "measured end must be attrs-guarded against the connect preflight",
        ).toBeGreaterThan(0);
      }
      if (scenarioMaturity(scenario) === "exploratory") {
        const officials = (scenario.spec.metrics ?? []).filter((m) => m.official);
        for (const metric of officials) {
          expect(metric.name).toBe("scenario.wallclock");
        }
      }
    },
  );
});

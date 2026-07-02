/**
 * Scenario registry (design §7/§8). Scenario definitions are data
 * (ScenarioSpec) executed by the driver's step engine; the registry tracks
 * which are implemented so `scenarios list` never overstates coverage.
 */

import type { ScenarioSpec } from "@mssqlperf/contracts";

export interface RegisteredScenario {
  spec: ScenarioSpec;
  /** Milestone in which the scenario becomes runnable end-to-end. */
  implemented: boolean;
  plannedMilestone: string;
}

const registry = new Map<string, RegisteredScenario>();

function register(scenario: RegisteredScenario): void {
  registry.set(scenario.spec.scenarioId, scenario);
}

// ---------------------------------------------------------------------------
// noop — the Milestone 1 seed-crystal scenario. Measures the pure harness
// loop: control round-trip + marker plumbing, no product interaction.
// ---------------------------------------------------------------------------
register({
  implemented: false, // flipped in Milestone 1 when the driver exists
  plannedMilestone: "M1",
  spec: {
    scenarioId: "noop",
    displayName: "No-op scenario (harness loop only)",
    tags: ["harness", "smoke"],
    profileMode: "fresh",
    setup: [],
    measure: {
      start: { type: "beforeFirstAction" },
      action: [{ type: "noop" }],
      end: { type: "afterLastAction" },
      timeoutMs: 30000,
    },
    success: [{ type: "noErrors", sources: ["automation"] }],
    cleanup: [],
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

register({
  implemented: false,
  plannedMilestone: "M2",
  spec: {
    scenarioId: "ext-normal-activation",
    displayName: "vscode-mssql normal activation (warmed profile)",
    tags: ["activation", "extension"],
    profileMode: "warmed",
    measure: {
      start: { type: "beforeFirstAction" },
      action: [{ type: "waitForMarker", name: "mssql.activate.end", timeoutMs: 60000 }],
      end: { type: "waitForMarker", name: "mssql.activate.end" },
      timeoutMs: 90000,
    },
    success: [
      { type: "markerSeen", name: "mssql.activate.begin" },
      { type: "markerSeen", name: "mssql.activate.end" },
      { type: "noErrors", sources: ["automation", "vscode-mssql"] },
    ],
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
      { name: "extension.activate", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

register({
  implemented: false,
  plannedMilestone: "M4",
  spec: {
    scenarioId: "connect-local-container",
    displayName: "Connect to local SQL Server",
    tags: ["connection", "sts", "sql"],
    profileMode: "warmed",
    sql: { connectionProfile: "local-container", cacheMode: "warm" },
    measure: {
      start: { type: "beforeCommand", command: "mssql.connect" },
      action: [{ type: "command", command: "mssql.connect" }],
      end: { type: "waitForMarker", name: "mssql.connection.ready" },
      timeoutMs: 60000,
    },
    success: [
      { type: "markerSeen", name: "mssql.connection.ready" },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

register({
  implemented: false,
  plannedMilestone: "M4",
  spec: {
    scenarioId: "query-10k-results",
    displayName: "Run query with 10000 result rows",
    tags: ["query", "results-grid", "webview", "sqlclient"],
    profileMode: "warmed",
    sql: {
      database: "PerfHarness",
      cacheMode: "warm",
      connectionProfile: "local-container",
    },
    setup: [
      { type: "command", command: "mssql.connect" },
      { type: "waitForMarker", name: "mssql.connection.ready", timeoutMs: 30000 },
      { type: "openDocument", path: "queries/select-10000.sql" },
    ],
    measure: {
      start: { type: "beforeCommand", command: "mssql.runQuery" },
      action: [{ type: "command", command: "mssql.runQuery" }],
      end: { type: "waitForMarker", name: "mssql.resultsGrid.renderComplete" },
      timeoutMs: 120000,
    },
    success: [
      { type: "markerSeen", name: "mssql.query.rowsRendered", attrs: { rowCount: 10000 } },
      { type: "webviewProbe", probe: "resultsGrid", assert: "rowCount == 10000" },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
      { name: "webview.resultsGrid.render", source: "webviewMark", official: false },
    ],
  },
});

export function listScenarios(): RegisteredScenario[] {
  return [...registry.values()];
}

export function getScenario(scenarioId: string): RegisteredScenario | undefined {
  return registry.get(scenarioId);
}

/** Flip a scenario to implemented (called by milestone wiring as it lands). */
export function markImplemented(scenarioId: string): void {
  const s = registry.get(scenarioId);
  if (s) {
    s.implemented = true;
  }
}

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
  implemented: true, // M1: driver + noop scenario landed
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
  implemented: true, // M2: product activation markers landed in vscode-mssql
  plannedMilestone: "M2",
  spec: {
    scenarioId: "ext-normal-activation",
    displayName: "vscode-mssql normal activation (warmed profile)",
    tags: ["activation", "extension"],
    profileMode: "warmed",
    measure: {
      start: { type: "beforeFirstAction" },
      // Focusing the Object Explorer view is the deterministic user action
      // that activates the extension (its view becomes visible).
      action: [{ type: "command", command: "objectExplorer.focus", timeoutMs: 300000 }],
      end: { type: "waitForMarker", name: "mssql.activate.end" },
      // Generous: the very first run may download SQL Tools Service into the
      // product repo (cached afterwards); the warmup rep absorbs it.
      timeoutMs: 300000,
    },
    success: [
      { type: "markerSeen", name: "mssql.activate.begin" },
      { type: "markerSeen", name: "mssql.activate.end" },
      { type: "noErrors", sources: ["automation", "vscode-mssql"] },
    ],
    // Reset the sidebar to Explorer so the next rep's window restore does NOT
    // re-open the Object Explorer view (which would activate the extension at
    // startup instead of on our measured action).
    cleanup: [{ type: "command", command: "workbench.view.explorer" }],
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
      {
        name: "extension.activate",
        source: "marker",
        official: true,
        lowerIsBetter: true,
        beginMarker: "mssql.activate.begin",
        endMarker: "mssql.activate.end",
        component: "extension",
        processRole: "extensionHost",
      },
      {
        name: "extension.stsSpawn",
        source: "marker",
        official: false,
        lowerIsBetter: true,
        beginMarker: "mssql.sts.spawn.begin",
        endMarker: "mssql.sts.spawn.end",
        component: "sts",
        processRole: "extensionHost",
      },
    ],
  },
});

register({
  implemented: true, // M4': product connection markers + driver mssqlConnect step
  plannedMilestone: "M4",
  spec: {
    scenarioId: "connect-local-container",
    displayName: "Connect to local SQL Server",
    tags: ["connection", "sts", "sql"],
    profileMode: "warmed",
    sql: { connectionProfile: "default", cacheMode: "warm" },
    setup: [
      // Activate the extension outside the measured window, then give the
      // connect step a document to bind the connection to.
      { type: "command", command: "objectExplorer.focus", timeoutMs: 300000 },
      { type: "waitForMarker", name: "mssql.activate.end", timeoutMs: 300000 },
      { type: "openDocument", path: "queries/select-10000.sql" },
    ],
    measure: {
      start: { type: "beforeFirstAction" },
      action: [{ type: "mssqlConnect", profile: "default", timeoutMs: 60000 }],
      end: { type: "waitForMarker", name: "mssql.connection.ready" },
      timeoutMs: 60000,
    },
    success: [
      { type: "markerSeen", name: "mssql.connection.begin" },
      { type: "markerSeen", name: "mssql.connection.ready" },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    cleanup: [{ type: "command", command: "workbench.view.explorer" }],
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
      {
        name: "mssql.connection",
        source: "marker",
        official: false,
        lowerIsBetter: true,
        beginMarker: "mssql.connection.begin",
        endMarker: "mssql.connection.ready",
        component: "connection",
        processRole: "extensionHost",
      },
    ],
  },
});

register({
  implemented: true, // M4': query markers + webview render-complete bridge
  plannedMilestone: "M4",
  spec: {
    scenarioId: "query-10k-results",
    displayName: "Run query with 10000 result rows",
    tags: ["query", "results-grid", "webview", "sqlclient"],
    profileMode: "warmed",
    sql: {
      database: "PerfHarness",
      cacheMode: "warm",
      connectionProfile: "default",
    },
    setup: [
      { type: "command", command: "objectExplorer.focus", timeoutMs: 300000 },
      { type: "waitForMarker", name: "mssql.activate.end", timeoutMs: 300000 },
      { type: "openDocument", path: "queries/select-10000.sql" },
      { type: "mssqlConnect", profile: "default", timeoutMs: 60000 },
      { type: "waitForMarker", name: "mssql.connection.ready", timeoutMs: 60000 },
    ],
    measure: {
      start: { type: "beforeCommand", command: "mssql.runQuery" },
      action: [{ type: "command", command: "mssql.runQuery" }],
      end: { type: "waitForMarker", name: "mssql.resultsGrid.renderComplete" },
      timeoutMs: 120000,
    },
    success: [
      // Success proof from two independent sources (design §7): the extension
      // saw 10k rows complete AND the webview grid rendered 10k rows.
      { type: "markerSeen", name: "mssql.query.complete", attrs: { rowCount: 10000 } },
      {
        type: "markerSeen",
        name: "mssql.resultsGrid.renderComplete",
        attrs: { rowCount: 10000 },
      },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    cleanup: [{ type: "command", command: "workbench.view.explorer" }],
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
      {
        name: "mssql.query.toComplete",
        source: "marker",
        official: false,
        lowerIsBetter: true,
        beginMarker: "mssql.query.submit",
        endMarker: "mssql.query.complete",
        component: "query",
        processRole: "extensionHost",
      },
      {
        name: "mssql.query.toRender",
        source: "marker",
        official: false,
        lowerIsBetter: true,
        beginMarker: "mssql.query.submit",
        endMarker: "mssql.resultsGrid.renderComplete",
        component: "webview",
        processRole: "boundary",
      },
    ],
  },
});

// ---------------------------------------------------------------------------
// Harness self-test scenarios (design §32 M6 acceptance). These exist to
// prove the gate and the invalid-run rules against real behavior.
// ---------------------------------------------------------------------------
register({
  implemented: true,
  plannedMilestone: "M6'",
  spec: {
    scenarioId: "noop-synthetic-delay",
    displayName: "No-op with synthetic 250ms delay (regression-gate proof)",
    tags: ["harness", "synthetic"],
    profileMode: "fresh",
    measure: {
      start: { type: "beforeFirstAction" },
      action: [{ type: "syntheticDelay", ms: 250 }],
      end: { type: "afterLastAction" },
      timeoutMs: 30000,
    },
    success: [{ type: "noErrors", sources: ["automation"] }],
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

register({
  implemented: true,
  plannedMilestone: "M6'",
  spec: {
    scenarioId: "noop-missing-marker",
    displayName: "Waits for a marker that never arrives (invalid-run proof)",
    tags: ["harness", "synthetic"],
    profileMode: "fresh",
    measure: {
      start: { type: "beforeFirstAction" },
      action: [{ type: "noop" }],
      end: { type: "waitForMarker", name: "perf.never.emitted" },
      timeoutMs: 5000,
    },
    success: [{ type: "noErrors", sources: ["automation"] }],
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

// ---------------------------------------------------------------------------
// Soak / stress scenarios (Phase-2 M10)
// ---------------------------------------------------------------------------
register({
  implemented: true,
  plannedMilestone: "M10",
  spec: {
    scenarioId: "soak-connect-query-disconnect",
    displayName: "Soak: connect → 10k query → disconnect loop (default 1000 iterations)",
    tags: ["soak", "reliability", "memory", "sql"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: [
      { type: "command", command: "objectExplorer.focus", timeoutMs: 300000 },
      { type: "waitForMarker", name: "mssql.activate.end", timeoutMs: 300000 },
      { type: "openDocument", path: "queries/select-10000.sql" },
    ],
    loop: {
      iterations: 1000, // override per-run with vscode.env.PERF_SOAK_ITERATIONS
      warmupIterations: 5,
      onFailure: "continue", // reliability runs record every failure
      steps: [
        { type: "mssqlConnect", profile: "default", timeoutMs: 30000 },
        { type: "waitForMarker", name: "mssql.connection.ready", timeoutMs: 30000 },
        { type: "command", command: "mssql.runQuery", timeoutMs: 30000 },
        { type: "waitForMarker", name: "mssql.query.complete", timeoutMs: 60000 },
        { type: "mssqlDisconnect", timeoutMs: 30000 },
      ],
      // Correctness under load: every iteration must return exactly 10k rows.
      success: [{ type: "markerSeen", name: "mssql.query.complete", attrs: { rowCount: 10000 } }],
    },
    measure: {
      start: { type: "beforeFirstAction" },
      action: [], // the loop IS the measured window
      end: { type: "afterLastAction" },
      timeoutMs: 7_200_000, // 2h ceiling for the full 1000 iterations
    },
    success: [{ type: "noErrors", sources: ["automation"] }],
    cleanup: [{ type: "command", command: "workbench.view.explorer" }],
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
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

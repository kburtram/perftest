/**
 * Scenario registry (design §7/§8). Scenario definitions are data
 * (ScenarioSpec) executed by the driver's step engine; the registry tracks
 * which are implemented so `scenarios list` never overstates coverage.
 */

import type { ScenarioSpec } from "@mssqlperf/contracts";

export type ScenarioMaturity =
  | "exploratory"
  | "diagnostic"
  | "measurementCandidate"
  | "ciGating"
  | "releaseGate";

export interface RegisteredScenario {
  spec: ScenarioSpec;
  /** Milestone in which the scenario becomes runnable end-to-end. */
  implemented: boolean;
  plannedMilestone: string;
  /**
   * Graduation level (peer-review scenario lifecycle). Defaults:
   * implemented scenarios are measurementCandidate until explicitly
   * promoted; unimplemented ones are exploratory. Promotion to ciGating
   * requires baseline history + variance evidence, not enthusiasm.
   */
  maturity?: ScenarioMaturity;
}

export function scenarioMaturity(entry: RegisteredScenario): ScenarioMaturity {
  return entry.maturity ?? (entry.implemented ? "measurementCandidate" : "exploratory");
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
  maturity: "ciGating", // the proven non-regression gate
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

// ---------------------------------------------------------------------------
// Phase 3: original-scope closures + advanced realistic scenarios.
// Common setup fragments.
// ---------------------------------------------------------------------------
const ACTIVATE_STEPS: import("@mssqlperf/contracts").ScenarioStep[] = [
  { type: "command", command: "objectExplorer.focus", timeoutMs: 300000 },
  { type: "waitForMarker", name: "mssql.activate.end", timeoutMs: 300000 },
];
const CLEANUP_EXPLORER: import("@mssqlperf/contracts").ScenarioStep[] = [
  { type: "command", command: "workbench.view.explorer" },
];

function querySetup(fixture: string): import("@mssqlperf/contracts").ScenarioStep[] {
  return [
    ...ACTIVATE_STEPS,
    { type: "openDocument", path: `queries/${fixture}` },
    { type: "mssqlConnect", profile: "default", timeoutMs: 60000 },
    { type: "waitForMarker", name: "mssql.connection.ready", timeoutMs: 60000 },
  ];
}

// 12.10 — first-launch: official metric is orchestrator spawn→driver ready.
register({
  implemented: true,
  plannedMilestone: "M12",
  spec: {
    scenarioId: "ext-first-launch",
    displayName: "VS Code first launch to driver-ready (fresh profile)",
    tags: ["startup", "vscode"],
    profileMode: "fresh",
    measure: {
      start: { type: "beforeFirstAction" },
      action: [{ type: "noop" }],
      end: { type: "afterLastAction" },
      timeoutMs: 60000,
    },
    success: [{ type: "noErrors", sources: ["automation"] }],
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: false, lowerIsBetter: true },
      { name: "vscode.startup.ready", source: "manual", official: true, lowerIsBetter: true },
    ],
  },
});

// 12.2 — Object Explorer at scale: all 10,000 tables proven.
register({
  implemented: true,
  plannedMilestone: "M12",
  spec: {
    scenarioId: "expand-tables-node-10k",
    displayName: "Expand Tables node with 10,000 tables (PerfCatalog)",
    tags: ["object-explorer", "scale", "smo"],
    profileMode: "warmed",
    sql: { database: "PerfCatalog", cacheMode: "warm", connectionProfile: "default" },
    setup: ACTIVATE_STEPS,
    measure: {
      start: { type: "beforeFirstAction" },
      action: [
        {
          type: "oeExpand",
          oePath: ["Tables"],
          profile: "default",
          timeoutMs: 300000,
        },
      ],
      end: { type: "afterLastAction" },
      timeoutMs: 360000,
    },
    success: [
      // The Tables node holds the 10,000 seeded tables PLUS SMO folder nodes
      // ("System Tables" etc.), so the tree count is bounded, not exact; the
      // exactly-10000 user tables proof is the provisioner's seed verify
      // (SELECT COUNT(*) FROM PerfCatalog.sys.tables = 10000).
      { type: "markerSeen", name: "mssql.oe.expand.end" },
      { type: "objectExplorerProbe", name: "Tables", assert: "childCount >= 10000" },
      { type: "objectExplorerProbe", name: "Tables", assert: "childCount <= 10050" },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
      {
        name: "mssql.oe.expandTables",
        source: "marker",
        official: false,
        lowerIsBetter: true,
        beginMarker: "mssql.oe.expand.begin",
        endMarker: "mssql.oe.expand.end",
        component: "objectExplorer",
        processRole: "extensionHost",
      },
    ],
  },
});

// 12.7 — variety basics.
register({
  implemented: true,
  plannedMilestone: "M12",
  spec: {
    scenarioId: "cancel-running-query",
    displayName: "Cancel a running query mid-flight",
    tags: ["query", "cancel", "reliability"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: querySetup("long-query.sql"),
    measure: {
      start: { type: "beforeFirstAction" },
      action: [
        { type: "command", command: "mssql.runQuery" },
        { type: "waitForMarker", name: "mssql.query.submit", timeoutMs: 30000 },
        { type: "command", command: "mssql.cancelQuery" },
      ],
      end: { type: "waitForMarker", name: "mssql.query.cancelled" },
      timeoutMs: 60000,
    },
    success: [
      { type: "markerSeen", name: "mssql.query.cancelled" },
      { type: "noErrors", sources: ["automation"] },
    ],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

register({
  implemented: true,
  plannedMilestone: "M12",
  spec: {
    scenarioId: "query-error-path",
    displayName: "Query with a syntax error fails gracefully",
    tags: ["query", "error", "reliability"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: querySetup("error.sql"),
    measure: {
      start: { type: "beforeCommand", command: "mssql.runQuery" },
      action: [{ type: "command", command: "mssql.runQuery" }],
      end: { type: "waitForMarker", name: "mssql.query.complete", attrs: { hasError: true } },
      timeoutMs: 60000,
    },
    success: [
      { type: "markerSeen", name: "mssql.query.complete", attrs: { hasError: true } },
      { type: "noErrors", sources: ["automation"] },
    ],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

register({
  implemented: true,
  plannedMilestone: "M12",
  spec: {
    scenarioId: "large-result-100k",
    displayName: "Run query with 100,000 result rows",
    tags: ["query", "results-grid", "scale"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: querySetup("select-100000.sql"),
    measure: {
      start: { type: "beforeCommand", command: "mssql.runQuery" },
      action: [{ type: "command", command: "mssql.runQuery" }],
      end: { type: "waitForMarker", name: "mssql.resultsGrid.renderComplete" },
      timeoutMs: 180000,
    },
    success: [
      { type: "markerSeen", name: "mssql.query.complete", attrs: { rowCount: 100000 } },
      { type: "markerSeen", name: "mssql.resultsGrid.renderComplete", attrs: { rowCount: 100000 } },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    cleanup: CLEANUP_EXPLORER,
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
    ],
  },
});

// 13.1 — virtual windowing proven from product markers + offset correctness.
register({
  implemented: true,
  plannedMilestone: "M13",
  spec: {
    scenarioId: "query-large-scroll-virtual-window",
    displayName: "100k grid: windowed fetches at scroll offsets (windowing proven)",
    tags: ["query", "results-grid", "virtualization"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: [
      ...querySetup("select-100000.sql"),
      { type: "command", command: "mssql.runQuery" },
      { type: "waitForMarker", name: "mssql.resultsGrid.renderComplete", timeoutMs: 180000 },
    ],
    measure: {
      start: { type: "beforeFirstAction" },
      action: [
        // Ids are deterministic: first cell at rowStart N is N+1.
        { type: "windowFetchCheck", rowStart: 50000, numberOfRows: 50, expectFirstCell: "50001" },
        { type: "windowFetchCheck", rowStart: 99900, numberOfRows: 50, expectFirstCell: "99901" },
        { type: "windowFetchCheck", rowStart: 12345, numberOfRows: 50, expectFirstCell: "12346" },
        // The fetch markers travel exthost→HTTP→relay; await the last one so
        // the success criteria (and teardown) can't race the marker flow.
        {
          type: "waitForMarker",
          name: "mssql.resultsGrid.windowFetch.end",
          attrs: { rowStart: 12345 },
          timeoutMs: 30000,
        },
      ],
      end: { type: "afterLastAction" },
      timeoutMs: 60000,
    },
    success: [
      // Windowing proven TRIGGERED by the product marker, at a deep offset.
      { type: "markerSeen", name: "mssql.resultsGrid.windowFetch.end", attrs: { rowStart: 99900 } },
      { type: "webviewProbe", probe: "resultsGrid", assert: "rowCount == 100000" },
      { type: "noErrors", sources: ["automation", "vscode-mssql"] },
    ],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

// 13.2 / 13.3 — heavy content shapes.
register({
  implemented: true,
  plannedMilestone: "M13",
  spec: {
    scenarioId: "query-blob-xml",
    displayName: "Query VARBINARY(MAX)/XML/NVARCHAR(MAX) cells",
    tags: ["query", "blob", "content"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: querySetup("blob-xml.sql"),
    measure: {
      start: { type: "beforeCommand", command: "mssql.runQuery" },
      action: [{ type: "command", command: "mssql.runQuery" }],
      end: { type: "waitForMarker", name: "mssql.resultsGrid.renderComplete" },
      timeoutMs: 180000,
    },
    success: [
      { type: "markerSeen", name: "mssql.query.complete", attrs: { rowCount: 20 } },
      { type: "webviewProbe", probe: "resultsGrid", assert: "rowCount == 20" },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

register({
  implemented: true,
  plannedMilestone: "M13",
  spec: {
    scenarioId: "query-many-result-sets",
    displayName: "One batch, 30 result sets — all grids proven",
    tags: ["query", "results-grid"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: querySetup("many-result-sets.sql"),
    measure: {
      start: { type: "beforeCommand", command: "mssql.runQuery" },
      action: [{ type: "command", command: "mssql.runQuery" }],
      end: { type: "waitForMarker", name: "mssql.resultsGrid.renderComplete" },
      timeoutMs: 120000,
    },
    success: [
      { type: "webviewProbe", probe: "resultsGrid", assert: "resultSets == 30" },
      { type: "webviewProbe", probe: "resultsGrid", assert: "rowCount == 1500" },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

register({
  implemented: true,
  plannedMilestone: "M13",
  spec: {
    scenarioId: "query-wide-columns",
    displayName: "300-column result — full column set proven",
    tags: ["query", "results-grid", "wide"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: querySetup("wide-columns.sql"),
    measure: {
      start: { type: "beforeCommand", command: "mssql.runQuery" },
      action: [{ type: "command", command: "mssql.runQuery" }],
      end: { type: "waitForMarker", name: "mssql.resultsGrid.renderComplete" },
      timeoutMs: 120000,
    },
    success: [
      { type: "webviewProbe", probe: "resultsGrid", assert: "columns == 300" },
      { type: "webviewProbe", probe: "resultsGrid", assert: "rowCount == 100" },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

// 13.4 — OE realism (assertions use >= to avoid over-claiming system folders).
register({
  implemented: true,
  plannedMilestone: "M13",
  spec: {
    scenarioId: "oe-expand-mixed-schema",
    displayName: "OE: expand Tables/Views/Procedures on a mixed schema",
    tags: ["object-explorer", "smo"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: ACTIVATE_STEPS,
    measure: {
      start: { type: "beforeFirstAction" },
      action: [
        { type: "oeExpand", oePath: ["Tables"], profile: "default", timeoutMs: 120000 },
        { type: "oeExpand", oePath: ["Views"], profile: "default", timeoutMs: 120000 },
        { type: "oeExpand", oePath: ["Programmability", "Stored Procedures"], profile: "default", timeoutMs: 120000 },
      ],
      end: { type: "afterLastAction" },
      timeoutMs: 300000,
    },
    success: [
      { type: "objectExplorerProbe", name: "Tables", assert: "childCount >= 7" },
      { type: "objectExplorerProbe", name: "Views", assert: "childCount >= 1" },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

register({
  implemented: true,
  plannedMilestone: "M13",
  spec: {
    scenarioId: "oe-expand-deep",
    displayName: "OE: deep expand to table columns",
    tags: ["object-explorer", "smo"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: ACTIVATE_STEPS,
    measure: {
      start: { type: "beforeFirstAction" },
      action: [
        {
          type: "oeExpand",
          oePath: ["Tables", "sales.Orders", "Columns"],
          profile: "default",
          timeoutMs: 180000,
        },
      ],
      end: { type: "afterLastAction" },
      timeoutMs: 300000,
    },
    success: [
      { type: "objectExplorerProbe", name: "Columns", assert: "childCount >= 4" },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

register({
  implemented: true,
  plannedMilestone: "M13",
  spec: {
    scenarioId: "oe-refresh",
    displayName: "OE: repeat expansion of the Tables node (refresh path)",
    tags: ["object-explorer", "smo"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: ACTIVATE_STEPS,
    measure: {
      start: { type: "beforeFirstAction" },
      action: [
        { type: "oeExpand", oePath: ["Tables"], profile: "default", timeoutMs: 120000 },
        { type: "oeExpand", oePath: ["Tables"], profile: "default", timeoutMs: 120000 },
      ],
      end: { type: "afterLastAction" },
      timeoutMs: 300000,
    },
    success: [
      { type: "objectExplorerProbe", name: "Tables", assert: "childCount >= 7" },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

// 13.5 — completion latency (foreshadows Phase-4 completions instrumentation).
register({
  implemented: true,
  plannedMilestone: "M13",
  spec: {
    scenarioId: "intellisense-completion-latency",
    displayName: "IntelliSense completion returns expected table",
    tags: ["intellisense", "language-service"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: querySetup("completion.sql"),
    measure: {
      start: { type: "beforeFirstAction" },
      action: [{ type: "completionProbe", expect: "PerfRows", timeoutMs: 120000 }],
      end: { type: "afterLastAction" },
      timeoutMs: 180000,
    },
    success: [{ type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] }],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
      {
        name: "intellisense.completion",
        source: "marker",
        official: false,
        lowerIsBetter: true,
        beginMarker: "driver.completion.begin",
        endMarker: "driver.completion.end",
        component: "languageService",
        processRole: "extensionHost",
      },
    ],
  },
});

// 13.6 — reliability paths.
register({
  implemented: true,
  plannedMilestone: "M13",
  spec: {
    scenarioId: "reconnect-cycle",
    displayName: "Disconnect then reconnect (recovery latency)",
    tags: ["connection", "reliability"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: querySetup("select-10000.sql"),
    measure: {
      start: { type: "beforeFirstAction" },
      action: [
        { type: "mssqlDisconnect", timeoutMs: 30000 },
        { type: "mssqlConnect", profile: "default", timeoutMs: 60000 },
      ],
      end: { type: "waitForMarker", name: "mssql.connection.ready" },
      timeoutMs: 120000,
    },
    success: [
      { type: "markerSeen", name: "mssql.connection.ready" },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

register({
  implemented: true,
  plannedMilestone: "M13",
  spec: {
    scenarioId: "large-script-execution",
    displayName: "200-batch script executes end to end",
    tags: ["query", "script", "reliability"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: querySetup("large-script.sql"),
    measure: {
      start: { type: "beforeCommand", command: "mssql.runQuery" },
      action: [{ type: "command", command: "mssql.runQuery" }],
      end: { type: "waitForMarker", name: "mssql.query.complete", attrs: { hasError: false } },
      timeoutMs: 300000,
    },
    success: [
      { type: "markerSeen", name: "mssql.query.complete", attrs: { hasError: false } },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
    ],
  },
});

// Phase-4 smoke: the Debug Console webview constructs inside a real VS Code
// without errors (activation + controller + bundle load path).
register({
  implemented: true,
  plannedMilestone: "M17",
  spec: {
    scenarioId: "debug-console-smoke",
    displayName: "MSSQL Debug Console opens without errors",
    tags: ["diagnostics", "webview"],
    profileMode: "warmed",
    setup: ACTIVATE_STEPS,
    measure: {
      start: { type: "beforeFirstAction" },
      action: [
        { type: "command", command: "mssql.openDebugConsole", timeoutMs: 60000 },
      ],
      end: { type: "afterLastAction" },
      timeoutMs: 120000,
    },
    success: [{ type: "noErrors", sources: ["automation", "vscode-mssql"] }],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: false, lowerIsBetter: true },
    ],
  },
});

// ---------------------------------------------------------------------------
// Query Studio (Phase 2 feature build). Exploratory until baseline history
// exists. Setup flips the preview gates through the PERF_MODE-only
// mssql.perf.setConfig command (late registration in the extension makes the
// custom editor available without a reload).
// ---------------------------------------------------------------------------

register({
  implemented: true,
  plannedMilestone: "QS-M2",
  maturity: "exploratory",
  spec: {
    scenarioId: "querystudio-open",
    displayName: "Query Studio: open new query editor",
    tags: ["querystudio", "webview"],
    profileMode: "warmed",
    setup: [
      ...ACTIVATE_STEPS,
      {
        type: "command",
        command: "mssql.perf.setConfig",
        args: ["mssql.sqlDataPlane.enabled", true],
        timeoutMs: 15000,
      },
      {
        type: "command",
        command: "mssql.perf.setConfig",
        args: ["mssql.queryStudio.enabled", true],
        timeoutMs: 15000,
      },
    ],
    measure: {
      start: { type: "beforeFirstAction" },
      action: [
        { type: "command", command: "mssql.queryStudio.new", timeoutMs: 60000 },
        {
          type: "waitForMarker",
          name: "mssql.queryStudio.open.end",
          timeoutMs: 60000,
        },
      ],
      end: { type: "afterLastAction" },
      timeoutMs: 120000,
    },
    success: [{ type: "noErrors", sources: ["automation", "vscode-mssql"] }],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: false, lowerIsBetter: true },
      {
        name: "queryStudio.open",
        source: "marker",
        official: false,
        lowerIsBetter: true,
        beginMarker: "mssql.queryStudio.open.begin",
        endMarker: "mssql.queryStudio.open.end",
      },
    ],
  },
});

// Query Studio 10k-row query — the head-to-head counterpart of the classic
// query-10k-results gate: SAME fixture document (queries/select-10000.sql),
// SAME provisioned SQL server, measured through the Query Studio data plane.
// The preview gates are PRE-SEEDED into the profile's settings.json (not
// flipped via setConfig): mssql.sqlDataPlane.enabled must be true when the
// extension ACTIVATES so serviceclient spawns STS with --enable-sts2 — the
// v2 lane the QS session rides. Setup opens the fixture in the QS custom
// editor, then drives the PERF_MODE connect seam (the driver writes the
// provisioned profile as the ONLY saved connection so the product's
// exactly-one-profile auto-pick engages). scenario.wallclock stays the
// driver-plane official metric; the product metric is the registry-derived
// mssql.queryStudio.query.toRender (submit → resultsRendered, epoch plane —
// diagnostic like its classic twin).
register({
  implemented: true, // B7.7: driver queryStudioConnect/Execute steps + QS perf seams
  plannedMilestone: "QS-M2",
  maturity: "exploratory",
  spec: {
    scenarioId: "querystudio-query-10k",
    displayName: "Query Studio: run query with 10000 result rows",
    tags: ["querystudio", "query", "results-grid", "webview"],
    profileMode: "warmed",
    userSettings: {
      "mssql.sqlDataPlane.enabled": true,
      "mssql.queryStudio.enabled": true,
    },
    sql: {
      database: "PerfHarness",
      cacheMode: "warm",
      connectionProfile: "default",
    },
    setup: [
      ...ACTIVATE_STEPS,
      { type: "openDocument", path: "queries/select-10000.sql" },
      { type: "command", command: "mssql.queryStudio.openActive", timeoutMs: 60000 },
      { type: "waitForMarker", name: "mssql.queryStudio.open.end", timeoutMs: 60000 },
      { type: "queryStudioConnect", profile: "default", timeoutMs: 90000 },
    ],
    measure: {
      start: { type: "beforeFirstAction" },
      action: [{ type: "queryStudioExecute", timeoutMs: 120000 }],
      // rows-guarded: the connect step's unmeasured session preflight renders
      // its own (1-row) results — only the real 10k render ends the window.
      end: {
        type: "waitForMarker",
        name: "mssql.queryStudio.resultsRendered",
        attrs: { rows: 10000 },
      },
      timeoutMs: 120000,
    },
    success: [
      // Success proof from two independent sources (mirrors query-10k-results):
      // the extension host saw 10k rows complete AND the webview rendered 10k.
      { type: "markerSeen", name: "mssql.queryStudio.query.complete", attrs: { rows: 10000 } },
      { type: "markerSeen", name: "mssql.queryStudio.resultsRendered", attrs: { rows: 10000 } },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    cleanup: [
      { type: "command", command: "workbench.action.closeActiveEditor" },
      ...CLEANUP_EXPLORER,
    ],
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
      // withinMeasuredWindow: the setup preflight emits the same product
      // marker family — only the measured pair may be timed.
      {
        name: "mssql.queryStudio.query.toComplete",
        source: "marker",
        official: false,
        lowerIsBetter: true,
        beginMarker: "mssql.queryStudio.query.submit",
        endMarker: "mssql.queryStudio.query.complete",
        component: "queryStudio",
        processRole: "extensionHost",
        withinMeasuredWindow: true,
      },
      {
        name: "mssql.queryStudio.query.toRender",
        source: "marker",
        official: false,
        lowerIsBetter: true,
        beginMarker: "mssql.queryStudio.query.submit",
        endMarker: "mssql.queryStudio.resultsRendered",
        component: "queryStudio",
        processRole: "boundary",
        withinMeasuredWindow: true,
      },
    ],
  },
});

// Object Explorer v2 browse (OE v2 B21, exploratory): activate with the
// v2 preview view + data plane on, then drive the PERF_MODE seam that
// connects the provisioned profile through the data plane and expands the
// server catalog to a rendered Databases list. The seam THROWS on every
// honesty failure (no profile / connect failed / zero databases), so
// noErrors is a real proof. No new markers: wallclock covers
// connect + server-catalog hydration + expand (the OE v2 host-work targets
// are covered separately by the unit-lane scale suite).
register({
  implemented: true, // OE v2 B21: mssql.perf.objectExplorerV2Browse seam
  plannedMilestone: "OE2-7",
  maturity: "exploratory",
  spec: {
    scenarioId: "objectexplorerv2-browse",
    displayName: "Object Explorer v2: connect and expand Databases",
    tags: ["objectexplorer", "oev2", "metadata"],
    profileMode: "warmed",
    userSettings: {
      "mssql.sqlDataPlane.enabled": true,
      "mssql.objectExplorer.viewMode": "v2Preview",
    },
    sql: {
      database: "PerfHarness",
      cacheMode: "warm",
      connectionProfile: "default",
    },
    setup: [
      ...ACTIVATE_STEPS,
      // Saved profile only — OE v2 performs its own (measured) connect.
      { type: "provisionConnectionProfile", profile: "default", timeoutMs: 30000 },
    ],
    measure: {
      start: { type: "beforeFirstAction" },
      action: [
        {
          type: "command",
          command: "mssql.perf.objectExplorerV2Browse",
          timeoutMs: 90000,
        },
      ],
      end: { type: "afterLastAction" },
      timeoutMs: 120000,
    },
    success: [{ type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] }],
    cleanup: CLEANUP_EXPLORER,
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: false, lowerIsBetter: true },
    ],
  },
});

// ---------------------------------------------------------------------------
// Designers (Chunk 4: CLI port of the in-proc designerOpen semantics).
// Metric names + marker pairs are IDENTICAL to the self-test catalog so a
// designer scenario graduates from local reproduction to CLI without a
// semantic rewrite. Diagnostic maturity until baseline history exists.
// ---------------------------------------------------------------------------

register({
  implemented: true, // C4: driver designerOpen step + STS DacFx designer spans
  plannedMilestone: "C4",
  maturity: "diagnostic",
  spec: {
    scenarioId: "table-designer-open",
    displayName: "Table Designer: open (new table)",
    tags: ["designer", "dacfx", "webview"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: ACTIVATE_STEPS,
    measure: {
      start: { type: "beforeFirstAction" },
      action: [
        { type: "designerOpen", designer: "tableDesigner", profile: "default", timeoutMs: 120000 },
        { type: "waitForMarker", name: "mssql.tableDesigner.init.end", timeoutMs: 120000 },
      ],
      end: { type: "afterLastAction" },
      timeoutMs: 300000,
    },
    success: [
      { type: "markerSeen", name: "mssql.tableDesigner.init.end" },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    cleanup: [{ type: "command", command: "workbench.action.closeActiveEditor" }],
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
      {
        name: "mssql.tableDesigner.init",
        source: "marker",
        official: true,
        lowerIsBetter: true,
        beginMarker: "mssql.tableDesigner.init.begin",
        endMarker: "mssql.tableDesigner.init.end",
        component: "tableDesigner",
      },
    ],
  },
});

register({
  implemented: true, // C4
  plannedMilestone: "C4",
  maturity: "diagnostic",
  spec: {
    scenarioId: "schema-designer-open",
    displayName: "Schema Designer: open",
    tags: ["designer", "dacfx", "webview"],
    profileMode: "warmed",
    sql: { database: "PerfHarness", cacheMode: "warm", connectionProfile: "default" },
    setup: ACTIVATE_STEPS,
    measure: {
      start: { type: "beforeFirstAction" },
      action: [
        {
          type: "designerOpen",
          designer: "schemaDesigner",
          profile: "default",
          timeoutMs: 180000,
        },
        { type: "waitForMarker", name: "mssql.schemaDesigner.init.end", timeoutMs: 180000 },
      ],
      end: { type: "afterLastAction" },
      timeoutMs: 300000,
    },
    success: [
      { type: "markerSeen", name: "mssql.schemaDesigner.init.end" },
      { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
    ],
    cleanup: [{ type: "command", command: "workbench.action.closeActiveEditor" }],
    metrics: [
      { name: "scenario.wallclock", source: "marker", official: true, lowerIsBetter: true },
      {
        name: "mssql.schemaDesigner.init",
        source: "marker",
        official: true,
        lowerIsBetter: true,
        beginMarker: "mssql.schemaDesigner.init.begin",
        endMarker: "mssql.schemaDesigner.init.end",
        component: "schemaDesigner",
      },
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

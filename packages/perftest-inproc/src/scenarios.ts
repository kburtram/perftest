/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Built-in self-test scenarios. These are the orchestrated-harness scenarios
 * adapted to run in-process against the live extension host: no workspace
 * fixtures (queries are inline, untitled SQL documents), and portable SQL that
 * runs against any SQL Server (sys.all_objects), so a self-test needs only a
 * connection — not the provisioned PerfHarness/PerfCatalog databases.
 *
 * `needsSql` scenarios are offered but honestly blocked when no connection is
 * resolvable; the connection-free scenarios exercise the full activation →
 * STS → webview span chain and always run.
 */

import type { ScenarioSpec } from "./scenarioEngine";

export interface MetricDef {
    name: string;
    official: boolean;
    lowerIsBetter?: boolean;
    /** Derived duration metrics: end marker time − begin marker time. */
    beginMarker?: string;
    endMarker?: string;
}

export interface BuiltinScenario {
    id: string;
    title: string;
    description: string;
    tags: string[];
    /** Requires a live SQL connection (offered but blocked when none resolves). */
    needsSql: boolean;
    /** Rough single-rep cost hint for the UI (ms). */
    estMs: number;
    spec: ScenarioSpec;
    metrics: MetricDef[];
}

const WALLCLOCK: MetricDef = {
    name: "scenario.wallclock",
    official: true,
    lowerIsBetter: true,
};

// A portable row-generating query: TOP N over sys.all_objects returns exactly
// N rows on any non-trivial SQL Server, no fixture database required.
function rowQuery(rows: number): string {
    return `SELECT TOP (${rows}) o.object_id AS Id, o.name AS Name, o.type_desc AS Kind\nFROM sys.all_objects o\nORDER BY o.object_id;`;
}

export const BUILTIN_SCENARIOS: BuiltinScenario[] = [
    {
        id: "selftest-noop",
        title: "Harness loop (no-op)",
        description:
            "Pure self-test loop: marker plumbing and the measured-interval mechanics, no product interaction. Proves the runner end to end in well under a second.",
        tags: ["harness", "smoke"],
        needsSql: false,
        estMs: 50,
        metrics: [WALLCLOCK],
        spec: {
            scenarioId: "selftest-noop",
            displayName: "Harness loop (no-op)",
            measure: {
                start: { type: "beforeFirstAction" },
                action: [{ type: "noop" }],
                end: { type: "afterLastAction" },
                timeoutMs: 30000,
            },
            success: [{ type: "noErrors", sources: ["automation"] }],
        },
    },
    {
        id: "selftest-synthetic-delay",
        title: "Synthetic 250ms delay",
        description:
            "Injects a real, transparent 250ms cost inside the measured window — a known-good reference for the timing path and the History trend line.",
        tags: ["harness", "synthetic"],
        needsSql: false,
        estMs: 300,
        metrics: [WALLCLOCK],
        spec: {
            scenarioId: "selftest-synthetic-delay",
            displayName: "Synthetic 250ms delay",
            measure: {
                start: { type: "beforeFirstAction" },
                action: [{ type: "syntheticDelay", ms: 250 }],
                end: { type: "afterLastAction" },
                timeoutMs: 30000,
            },
            success: [{ type: "noErrors", sources: ["automation"] }],
        },
    },
    {
        id: "selftest-activation",
        title: "Extension activation",
        description:
            "Focuses the Object Explorer view to activate the extension and waits for activate.end. Exercises the full extension → STS spawn → RPC handshake chain; the waterfall shows STS coming up.",
        tags: ["activation", "extension", "sts"],
        needsSql: false,
        estMs: 2500,
        metrics: [
            WALLCLOCK,
            {
                name: "extension.activate",
                official: true,
                lowerIsBetter: true,
                beginMarker: "mssql.activate.begin",
                endMarker: "mssql.activate.end",
            },
        ],
        spec: {
            scenarioId: "selftest-activation",
            displayName: "Extension activation",
            measure: {
                start: { type: "beforeFirstAction" },
                action: [{ type: "command", command: "objectExplorer.focus", timeoutMs: 300000 }],
                end: { type: "waitForMarker", name: "mssql.activate.end" },
                timeoutMs: 300000,
            },
            success: [
                { type: "markerSeen", name: "mssql.activate.end" },
                { type: "noErrors", sources: ["automation", "vscode-mssql"] },
            ],
        },
    },
    {
        id: "selftest-debug-console",
        title: "Open Debug Console",
        description:
            "Opens the MSSQL Debug Console webview. Exercises the webview controller span seam — the same one that covers every dialog and designer — so the waterfall shows a webview lane.",
        tags: ["diagnostics", "webview"],
        needsSql: false,
        estMs: 800,
        metrics: [WALLCLOCK],
        spec: {
            scenarioId: "selftest-debug-console",
            displayName: "Open Debug Console",
            measure: {
                start: { type: "beforeFirstAction" },
                action: [{ type: "command", command: "mssql.openDebugConsole", timeoutMs: 60000 }],
                end: { type: "afterLastAction" },
                timeoutMs: 120000,
            },
            success: [{ type: "noErrors", sources: ["automation", "vscode-mssql"] }],
        },
    },
    {
        id: "selftest-connect",
        title: "Connect to SQL Server",
        description:
            "Opens an untitled SQL document and connects it to the resolved server. The waterfall shows connection.begin → STS → connection.ready.",
        tags: ["connection", "sts", "sql"],
        needsSql: true,
        estMs: 3000,
        metrics: [
            WALLCLOCK,
            {
                name: "mssql.connection",
                official: false,
                lowerIsBetter: true,
                beginMarker: "mssql.connection.begin",
                endMarker: "mssql.connection.ready",
            },
        ],
        spec: {
            scenarioId: "selftest-connect",
            displayName: "Connect to SQL Server",
            setup: [{ type: "openUntitledSql", content: "SELECT 1 AS ok;" }],
            measure: {
                start: { type: "beforeFirstAction" },
                action: [{ type: "mssqlConnect", profile: "default", timeoutMs: 60000 }],
                end: { type: "waitForMarker", name: "mssql.connection.ready" },
                timeoutMs: 60000,
            },
            success: [
                { type: "markerSeen", name: "mssql.connection.ready" },
                { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
            ],
        },
    },
    {
        id: "selftest-query-1k",
        title: "Query 1,000 rows",
        description:
            "Connects, runs a portable 1,000-row query in an untitled document, and waits for the results grid to finish rendering. The flagship waterfall: query.submit → RPC → STS dispatcher → SqlCommand (driver lane) → results-grid render.",
        tags: ["query", "results-grid", "webview", "driver"],
        needsSql: true,
        estMs: 4000,
        metrics: [
            WALLCLOCK,
            {
                name: "mssql.query.toComplete",
                official: false,
                lowerIsBetter: true,
                beginMarker: "mssql.query.submit",
                endMarker: "mssql.query.complete",
            },
            {
                name: "mssql.query.toRender",
                official: false,
                lowerIsBetter: true,
                beginMarker: "mssql.query.submit",
                endMarker: "mssql.resultsGrid.renderComplete",
            },
        ],
        spec: {
            scenarioId: "selftest-query-1k",
            displayName: "Query 1,000 rows",
            setup: [
                { type: "openUntitledSql", content: rowQuery(1000) },
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
                { type: "markerSeen", name: "mssql.query.complete" },
                { type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] },
            ],
        },
    },
    {
        id: "selftest-oe-expand-databases",
        title: "Object Explorer: expand Databases",
        description:
            "Creates an Object Explorer session and expands the Databases node through the real tree provider. Exercises SMO on the STS side — the driver lane shows sts.smo.expand.",
        tags: ["object-explorer", "smo", "driver"],
        needsSql: true,
        estMs: 5000,
        metrics: [
            WALLCLOCK,
            {
                name: "mssql.oe.expand",
                official: false,
                lowerIsBetter: true,
                beginMarker: "mssql.oe.expand.begin",
                endMarker: "mssql.oe.expand.end",
            },
        ],
        spec: {
            scenarioId: "selftest-oe-expand-databases",
            displayName: "Object Explorer: expand Databases",
            measure: {
                start: { type: "beforeFirstAction" },
                action: [
                    { type: "oeExpand", oePath: ["Databases"], profile: "default", timeoutMs: 120000 },
                ],
                end: { type: "afterLastAction" },
                timeoutMs: 180000,
            },
            success: [{ type: "noErrors", sources: ["automation", "vscode-mssql", "sts"] }],
        },
    },
];

export function builtinScenario(id: string): BuiltinScenario | undefined {
    return BUILTIN_SCENARIOS.find((s) => s.id === id);
}

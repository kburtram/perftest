/**
 * Scenario step engine (design §16.2). Executes ScenarioSpec steps with
 * VS Code commands and semantic waits — no sleeps, no pixel automation.
 * Steps the driver cannot execute honestly (unimplemented probes) fail the
 * scenario rather than pretending.
 */

import * as vscode from "vscode";
import type { MarkerBus } from "./markerBus";

// Structural mirrors of @mssqlperf/contracts (the driver is dependency-free,
// so the shapes are duplicated here; the wire format is identical JSON).
export interface ScenarioStep {
  type: string;
  command?: string;
  args?: unknown[];
  path?: string;
  name?: string;
  attrs?: Record<string, unknown>;
  probe?: string;
  assert?: string;
  profile?: string;
  timeoutMs?: number;
}

export interface ConnectionProfileSpec {
  server: string;
  database?: string;
  authenticationType: "SqlLogin" | "Integrated";
  user?: string;
  password?: string;
  encrypt?: string;
  trustServerCertificate?: boolean;
}

export interface SuccessCriterion {
  type: string;
  name?: string;
  attrs?: Record<string, unknown>;
  probe?: string;
  assert?: string;
  sources?: string[];
}

export interface MeasureSpec {
  start: { type: string; command?: string; name?: string };
  action: ScenarioStep[];
  end: { type: string; name?: string; attrs?: Record<string, unknown> };
  timeoutMs: number;
}

export interface ScenarioSpec {
  scenarioId: string;
  displayName: string;
  setup?: ScenarioStep[];
  measure: MeasureSpec;
  success?: SuccessCriterion[];
  cleanup?: ScenarioStep[];
}

export interface StepOutcome {
  step: string;
  status: "passed" | "failed" | "skipped";
  durationMs?: number;
  message?: string;
}

export interface ScenarioRunResult {
  steps: StepOutcome[];
  successChecks: StepOutcome[];
  failure?: { reason: string; step?: string };
}

export interface EngineContext {
  emitMarker(
    name: string,
    phase: "instant" | "begin" | "end" | "counter",
    attrs?: Record<string, unknown>,
  ): void;
  bus: MarkerBus;
  errors: string[];
  log(message: string): void;
  connectionProfiles?: Record<string, ConnectionProfileSpec>;
  /** SQL Application Name for this rep — the XEvents correlation key (M8). */
  applicationName?: string;
}

const DEFAULT_STEP_TIMEOUT_MS = 30000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out after ${timeoutMs}ms: ${what}`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export async function runScenario(spec: ScenarioSpec, ctx: EngineContext): Promise<ScenarioRunResult> {
  const steps: StepOutcome[] = [];
  const successChecks: StepOutcome[] = [];

  const runSteps = async (list: ScenarioStep[] | undefined, phase: string): Promise<void> => {
    for (const step of list ?? []) {
      const label = `${phase}:${describeStep(step)}`;
      const started = Date.now();
      try {
        await executeStep(step, ctx);
        steps.push({ step: label, status: "passed", durationMs: Date.now() - started });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        steps.push({ step: label, status: "failed", durationMs: Date.now() - started, message });
        ctx.errors.push(message);
        throw new ScenarioStepError(label, message);
      }
    }
  };

  try {
    await runSteps(spec.setup, "setup");

    // Measured interval. scenario.start is emitted immediately before the
    // first action; scenario.end when the end condition resolves.
    const measureStartUnixNs = (BigInt(Date.now()) * 1000000n).toString();
    ctx.emitMarker("scenario.start", "instant", { scenarioId: spec.scenarioId });
    // Gate-proof hook: PERF_SYNTHETIC_DELAY_MS injects a real, transparent
    // delay into the measured window so the regression pipeline can be proven
    // against an actual slowdown. Recorded on scenario.end for auditability.
    const syntheticDelayMs = Number(process.env["PERF_SYNTHETIC_DELAY_MS"] ?? "0");
    try {
      await runSteps(spec.measure.action, "action");
      if (syntheticDelayMs > 0) {
        await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, syntheticDelayMs));
      }
      if (spec.measure.end.type === "waitForMarker" && spec.measure.end.name) {
        // Freshness guard: only a marker emitted at/after scenario.start can
        // end the measured interval — stale markers from startup can't.
        await ctx.bus.wait(
          spec.measure.end.name,
          spec.measure.end.attrs,
          spec.measure.timeoutMs,
          measureStartUnixNs,
        );
        ctx.emitMarker("scenario.end", "instant", {
          scenarioId: spec.scenarioId,
          endBasis: spec.measure.end.name,
          ...(syntheticDelayMs > 0 ? { syntheticDelayMs } : {}),
        });
      } else {
        ctx.emitMarker("scenario.end", "instant", {
          scenarioId: spec.scenarioId,
          endBasis: "afterLastAction",
          ...(syntheticDelayMs > 0 ? { syntheticDelayMs } : {}),
        });
      }
    } catch (error) {
      // The measured interval broke: emit no scenario.end (the rep must be
      // invalid — a fabricated end would be a lie) and rethrow.
      throw error;
    }

    // Success criteria (design §7): all must pass or the rep is failed.
    for (const criterion of spec.success ?? []) {
      successChecks.push(evaluateCriterion(criterion, ctx));
    }

    await runSteps(spec.cleanup, "cleanup");

    const failedCheck = successChecks.find((c) => c.status === "failed");
    if (failedCheck) {
      return {
        steps,
        successChecks,
        failure: { reason: `success criterion failed: ${failedCheck.message ?? failedCheck.step}` },
      };
    }
    return { steps, successChecks };
  } catch (error) {
    const stepName = error instanceof ScenarioStepError ? error.step : undefined;
    const reason = error instanceof Error ? error.message : String(error);
    return { steps, successChecks, failure: { reason, ...(stepName ? { step: stepName } : {}) } };
  }
}

class ScenarioStepError extends Error {
  constructor(
    readonly step: string,
    message: string,
  ) {
    super(message);
  }
}

function describeStep(step: ScenarioStep): string {
  switch (step.type) {
    case "command":
    case "waitForCommandCompletion":
      return `${step.type}(${step.command ?? "?"})`;
    case "openDocument":
      return `openDocument(${step.path ?? "?"})`;
    case "waitForMarker":
      return `waitForMarker(${step.name ?? "?"})`;
    default:
      return step.type;
  }
}

async function executeStep(step: ScenarioStep, ctx: EngineContext): Promise<void> {
  const timeoutMs = step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  switch (step.type) {
    case "noop":
      return;
    case "syntheticDelay":
      // Gate-proving synthetic workload only (see contracts): the delay is a
      // real elapsed cost inside the measured window, honestly measured.
      await new Promise<void>((resolveDelay) =>
        setTimeout(resolveDelay, (step as unknown as { ms: number }).ms),
      );
      return;
    case "command":
    case "waitForCommandCompletion": {
      if (!step.command) {
        throw new Error("command step missing command id");
      }
      await withTimeout(
        Promise.resolve(vscode.commands.executeCommand(step.command, ...(step.args ?? []))),
        timeoutMs,
        `command ${step.command}`,
      );
      return;
    }
    case "openDocument": {
      if (!step.path) {
        throw new Error("openDocument step missing path");
      }
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
      const uri = workspaceRoot
        ? vscode.Uri.joinPath(workspaceRoot, step.path)
        : vscode.Uri.file(step.path);
      const doc = await withTimeout(
        Promise.resolve(vscode.workspace.openTextDocument(uri)),
        timeoutMs,
        `openTextDocument ${step.path}`,
      );
      await vscode.window.showTextDocument(doc, { preview: false });
      return;
    }
    case "waitForMarker": {
      if (!step.name) {
        throw new Error("waitForMarker step missing marker name");
      }
      await ctx.bus.wait(step.name, step.attrs, timeoutMs);
      return;
    }
    case "mssqlConnect": {
      const profileName = step.profile ?? "default";
      const profile = ctx.connectionProfiles?.[profileName];
      if (!profile) {
        throw new Error(`No connection profile '${profileName}' was provided by the orchestrator`);
      }
      await withTimeout(mssqlConnect(profile, ctx), timeoutMs, `mssqlConnect(${profileName})`);
      return;
    }
    case "webviewProbe":
    case "objectExplorerProbe":
      // Arrives with product instrumentation (M2/M4). Failing honestly beats
      // pretending the probe ran.
      throw new Error(`${step.type} is not implemented yet`);
    default:
      throw new Error(`Unknown step type '${step.type}'`);
  }
}

/**
 * Non-interactive connect through the product's own test seam. The product
 * emits mssql.connection.begin/ready markers around the real connection flow,
 * so timing comes from the product, not from this call.
 */
async function mssqlConnect(profile: ConnectionProfileSpec, ctx: EngineContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error("mssqlConnect requires an open document (add an openDocument step first)");
  }
  // Must match the product's connection key exactly: it uses uri.toString()
  // WITH encoding (models/utils.ts getActiveTextEditorUri) — toString(true)
  // would register the connection under a different key on Windows (c%3A vs c:).
  const uri = editor.document.uri.toString();
  const controller = (await vscode.commands.executeCommand("mssql.getControllerForTests")) as
    | { connectionManager?: { connect(fileUri: string, credentials: unknown, options?: unknown): Promise<boolean> } }
    | undefined;
  if (!controller?.connectionManager) {
    throw new Error("mssql.getControllerForTests returned no controller (is ms-mssql.mssql active?)");
  }
  const encrypt =
    profile.encrypt !== undefined
      ? profile.encrypt.toLowerCase() === "true"
        ? "Mandatory"
        : profile.encrypt.toLowerCase() === "false"
          ? "Optional"
          : profile.encrypt
      : "Optional";
  const credentials: Record<string, unknown> = {
    server: profile.server,
    database: profile.database ?? "",
    authenticationType: profile.authenticationType,
    user: profile.user ?? "",
    password: profile.password ?? "",
    savePassword: false,
    encrypt,
    trustServerCertificate: profile.trustServerCertificate ?? false,
    persistSecurityInfo: false,
    email: undefined,
    accountId: undefined,
    tenantId: undefined,
    connectTimeout: 30,
    commandTimeout: 30,
    // Correlation key for server-side XEvents capture (M8): exact-matched by
    // the harness, so it must be byte-identical to the orchestrator's format.
    applicationName: ctx.applicationName ?? "vscode-mssql-perf",
  };
  ctx.log(`connecting ${uri.slice(0, 80)} to ${profile.server}`);
  const ok = await controller.connectionManager.connect(uri, credentials, {
    shouldHandleErrors: false,
    connectionSource: "perfDriver",
  });
  if (!ok) {
    throw new Error(`connectionManager.connect returned false for server ${profile.server}`);
  }
}

function evaluateCriterion(criterion: SuccessCriterion, ctx: EngineContext): StepOutcome {
  switch (criterion.type) {
    case "markerSeen": {
      const seen = criterion.name ? ctx.bus.has(criterion.name, criterion.attrs) : false;
      const result: StepOutcome = {
        step: `markerSeen(${criterion.name ?? "?"})`,
        status: seen ? "passed" : "failed",
      };
      if (!seen) result.message = `marker '${criterion.name}' not observed`;
      return result;
    }
    case "noErrors": {
      const ok = ctx.errors.length === 0;
      const result: StepOutcome = { step: "noErrors", status: ok ? "passed" : "failed" };
      if (!ok) result.message = ctx.errors.join("; ");
      return result;
    }
    case "webviewProbe":
    case "objectExplorerProbe":
      return {
        step: criterion.type,
        status: "failed",
        message: `${criterion.type} not implemented yet`,
      };
    default:
      return {
        step: criterion.type,
        status: "failed",
        message: `unknown success criterion '${criterion.type}'`,
      };
  }
}

/**
 * Control-plane message contracts (design §9). The orchestrator hosts a
 * localhost WebSocket control server; the mssql-perf-driver automation
 * extension connects, authenticates with a token, and exchanges these
 * messages. Every message carries the same base envelope.
 */

import type { Marker } from "./marker";

export type ControlMessageKind =
  | "hello"
  | "ready"
  | "startScenario"
  | "scenarioStarted"
  | "marker"
  | "processDiscovered"
  | "scenarioCompleted"
  | "scenarioFailed"
  | "artifactHint"
  | "shutdown"
  | "heartbeat"
  | "calibrationPing"
  | "calibrationPong"
  | "error";

export type SenderRole =
  | "orchestrator"
  | "automationExtension"
  | "productExtension"
  | "sts"
  | "webview"
  | "child";

export interface ControlSender {
  role: SenderRole | string;
  pid: number;
  name: string;
}

export interface ControlMessageBase {
  schemaVersion: 1;
  kind: ControlMessageKind;
  runId: string;
  repId: number;
  scenarioId: string;
  /** Epoch nanoseconds as decimal string, stamped by the sender. */
  timestampUnixNs: string;
  sender: ControlSender;
}

/** Driver → orchestrator, first message after the socket opens. */
export interface HelloMessage extends ControlMessageBase {
  kind: "hello";
  payload: {
    token: string;
    vscodeVersion?: string;
    driverVersion?: string;
    extensionHostPid: number;
  };
}

/** Driver → orchestrator, after environment checks pass. */
export interface ReadyMessage extends ControlMessageBase {
  kind: "ready";
  payload: {
    checks?: Array<{ name: string; status: "passed" | "warning" | "failed"; message?: string }>;
  };
}

/** Orchestrator → driver: execute this scenario now. */
export interface StartScenarioMessage extends ControlMessageBase {
  kind: "startScenario";
  payload: {
    scenario: ScenarioSpec;
    traceId: string;
    rootTraceparent: string;
    artifactDir: string;
  };
}

/** Driver → orchestrator: scenario steps have begun. */
export interface ScenarioStartedMessage extends ControlMessageBase {
  kind: "scenarioStarted";
  payload: Record<string, never>;
}

/** Any perf-mode process → orchestrator: a semantic marker. */
export interface MarkerMessage extends ControlMessageBase {
  kind: "marker";
  payload: { marker: Marker };
}

/** Driver/product → orchestrator: a child process was discovered (design §15). */
export interface ProcessDiscoveredMessage extends ControlMessageBase {
  kind: "processDiscovered";
  payload: {
    role: string;
    pid: number;
    ppid?: number;
    name: string;
    commandLine?: string;
    startTimeUnixNs?: string;
    reportedBy: string;
    discoveryMethods: string[];
    version?: string;
  };
}

export interface StepOutcome {
  step: string;
  status: "passed" | "failed" | "skipped";
  durationMs?: number;
  message?: string;
}

/** Driver → orchestrator: scenario finished and success criteria evaluated. */
export interface ScenarioCompletedMessage extends ControlMessageBase {
  kind: "scenarioCompleted";
  payload: {
    successChecks: StepOutcome[];
    steps: StepOutcome[];
  };
}

/** Driver → orchestrator: scenario failed (timing not regression-eligible). */
export interface ScenarioFailedMessage extends ControlMessageBase {
  kind: "scenarioFailed";
  payload: {
    reason: string;
    step?: string;
    stack?: string;
    successChecks?: StepOutcome[];
  };
}

/** Any → orchestrator: an artifact was written that the normalizer should index. */
export interface ArtifactHintMessage extends ControlMessageBase {
  kind: "artifactHint";
  payload: {
    kind: string;
    path: string;
    contentType?: string;
  };
}

/** Orchestrator → driver: gracefully close VS Code. */
export interface ShutdownMessage extends ControlMessageBase {
  kind: "shutdown";
  payload: { reason: string };
}

export interface HeartbeatMessage extends ControlMessageBase {
  kind: "heartbeat";
  payload: { seq: number };
}

/**
 * Clock calibration (design §11.3): orchestrator sends ping with t0, driver
 * replies with its receive/send times, orchestrator computes offset/roundTrip.
 */
export interface CalibrationPingMessage extends ControlMessageBase {
  kind: "calibrationPing";
  payload: { seq: number; t0UnixNs: string };
}

export interface CalibrationPongMessage extends ControlMessageBase {
  kind: "calibrationPong";
  payload: { seq: number; t0UnixNs: string; e1UnixNs: string; e2UnixNs: string };
}

/** Either direction: protocol-level error report. */
export interface ErrorMessage extends ControlMessageBase {
  kind: "error";
  payload: { message: string; details?: Record<string, unknown> };
}

export type ControlMessage =
  | HelloMessage
  | ReadyMessage
  | StartScenarioMessage
  | ScenarioStartedMessage
  | MarkerMessage
  | ProcessDiscoveredMessage
  | ScenarioCompletedMessage
  | ScenarioFailedMessage
  | ArtifactHintMessage
  | ShutdownMessage
  | HeartbeatMessage
  | CalibrationPingMessage
  | CalibrationPongMessage
  | ErrorMessage;

// ---------------------------------------------------------------------------
// Scenario model (design §7) — the spec shipped to the driver in startScenario.
// ---------------------------------------------------------------------------

export type ScenarioStep =
  | { type: "command"; command: string; args?: unknown[]; timeoutMs?: number }
  | { type: "openDocument"; path: string; timeoutMs?: number }
  | { type: "waitForMarker"; name: string; attrs?: Record<string, unknown>; timeoutMs?: number }
  | { type: "waitForCommandCompletion"; command: string; args?: unknown[]; timeoutMs?: number }
  | { type: "webviewProbe"; probe: string; assert?: string; timeoutMs?: number }
  | { type: "objectExplorerProbe"; assert?: string; timeoutMs?: number }
  | { type: "noop" };

export type SuccessCriterion =
  | { type: "markerSeen"; name: string; attrs?: Record<string, unknown> }
  | { type: "webviewProbe"; probe: string; assert: string }
  | { type: "noErrors"; sources: string[] }
  | { type: "custom"; name: string };

export interface MeasureSpec {
  /** How the measured interval starts. */
  start:
    | { type: "beforeCommand"; command: string }
    | { type: "beforeFirstAction" }
    | { type: "marker"; name: string };
  action: ScenarioStep[];
  /** How the measured interval ends. */
  end:
    | { type: "waitForMarker"; name: string; attrs?: Record<string, unknown> }
    | { type: "afterLastAction" };
  timeoutMs: number;
}

export interface ScenarioSpec {
  scenarioId: string;
  displayName: string;
  tags?: string[];
  profileMode?: "fresh" | "warmed" | "reuse";
  workspace?: string;
  sql?: {
    database?: string;
    snapshot?: string;
    cacheMode?: string;
    connectionProfile?: string;
  };
  setup?: ScenarioStep[];
  measure: MeasureSpec;
  success?: SuccessCriterion[];
  cleanup?: ScenarioStep[];
  metrics?: Array<{
    name: string;
    source: string;
    official: boolean;
    lowerIsBetter?: boolean;
  }>;
  timeouts?: {
    readinessMs?: number;
    actionMs?: number;
    teardownMs?: number;
    collectorFlushMs?: number;
  };
}

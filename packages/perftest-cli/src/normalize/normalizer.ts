/**
 * Rep normalizer (design §20): turns the raw signals of one repetition —
 * markers, scenario outcome, calibration, environment — into a schema-valid
 * result.json.
 *
 * Honesty rules enforced here (§A3, §12.2):
 *  - scenario.wallclock exists ONLY if both required markers were observed.
 *  - A missing required marker ⇒ status `invalid`, no official metrics, ever.
 *  - `official: true` only in a measurement pass on a passed rep.
 *  - Durations come from one process's monotonic clock when possible; the
 *    fallback (epoch diff) is recorded via the `aggregation`-independent
 *    `tags.timePlane` so a reader can always tell how a number was derived.
 */

import type {
  Marker,
  Metric,
  PerfResult,
  PassType,
  RepStatus,
  ValidationRecord,
  ErrorRecord,
  GitRepoInfo,
  EnvironmentInfo,
  ArtifactRef,
  ScenarioSpec,
} from "@mssqlperf/contracts";
import { validateResult } from "@mssqlperf/contracts";
import type { CalibrationResult, ScenarioOutcome } from "../control/controlServer";

export interface NormalizeInputs {
  runId: string;
  repId: number;
  attemptId: number;
  scenarioId: string;
  passType: PassType;
  traceId: string;
  rootTraceparent: string;
  markers: Marker[];
  markersRejected: number;
  outcome: ScenarioOutcome | undefined;
  /** Set when the rep infrastructure broke (timeout, no connect, crash). */
  infrastructureError?: string;
  calibration?: CalibrationResult;
  environment: EnvironmentInfo;
  git: GitRepoInfo[];
  artifacts: ArtifactRef[];
  /** Scenario spec, for declared marker-pair metrics. */
  spec?: ScenarioSpec;
  /** Collector-produced metrics; forced official:false regardless of input. */
  extraMetrics?: Metric[];
  /** Collector validations (availability warnings etc.). */
  extraValidations?: ValidationRecord[];
}

/**
 * Duration between two markers, honest about the timing plane: same-process
 * monotonic when both markers allow it, epoch otherwise (tagged).
 */
function markerPairDuration(
  begin: Marker,
  end: Marker,
): { valueMs: number; timePlane: "monotonic" | "epoch" } {
  const samePlane = begin.process.pid === end.process.pid && begin.monotonicNs && end.monotonicNs;
  if (samePlane) {
    return {
      valueMs: Number(BigInt(end.monotonicNs as string) - BigInt(begin.monotonicNs as string)) / 1e6,
      timePlane: "monotonic",
    };
  }
  return {
    valueMs: Number(BigInt(end.timestampUnixNs) - BigInt(begin.timestampUnixNs)) / 1e6,
    timePlane: "epoch",
  };
}

export function normalizeRep(inputs: NormalizeInputs): PerfResult {
  const validations: ValidationRecord[] = [];
  const errors: ErrorRecord[] = [];
  const metrics: Metric[] = [];

  const start = inputs.markers.find((m) => m.name === "scenario.start");
  const end = inputs.markers.find((m) => m.name === "scenario.end");
  const requiredPresent = Boolean(start && end);

  validations.push({
    name: "requiredMarkersPresent",
    status: requiredPresent ? "passed" : "failed",
    ...(requiredPresent
      ? {}
      : { message: `missing ${!start ? "scenario.start " : ""}${!end ? "scenario.end" : ""}`.trim() }),
  });

  if (inputs.calibration) {
    const rttMs = Number(BigInt(inputs.calibration.roundTripNs)) / 1e6;
    validations.push({
      name: "clockCalibration",
      status: rttMs <= 50 ? "passed" : "warning",
      message: `offset=${inputs.calibration.offsetNs}ns roundTrip=${rttMs.toFixed(2)}ms over ${inputs.calibration.samples} samples`,
      details: { ...inputs.calibration },
    });
  } else {
    validations.push({
      name: "clockCalibration",
      status: "skipped",
      message: "no calibration performed",
    });
  }

  validations.push({
    name: "markerSinkClean",
    status: inputs.markersRejected === 0 ? "passed" : "warning",
    ...(inputs.markersRejected > 0
      ? { message: `${inputs.markersRejected} marker(s) rejected by schema validation` }
      : {}),
  });

  // --- Status determination (design §9.3 failure policy) -------------------
  let status: RepStatus;
  if (inputs.infrastructureError) {
    status = "invalid";
    errors.push({ kind: "infrastructure", message: inputs.infrastructureError, source: "harness" });
  } else if (!inputs.outcome) {
    status = "invalid";
    errors.push({ kind: "control", message: "no scenario outcome received", source: "harness" });
  } else if (!requiredPresent) {
    // Even a "completed" scenario without its required markers is untrusted.
    // Preserve the driver's failure reason so the report explains WHY.
    status = "invalid";
    if (inputs.outcome.kind === "failed") {
      const failed = inputs.outcome.failed;
      errors.push({
        kind: "scenario",
        message: failed?.payload.reason ?? "scenario failed",
        ...(failed?.payload.stack ? { stack: failed.payload.stack } : {}),
        source: "automationExtension",
      });
    }
  } else if (inputs.outcome.kind === "failed") {
    status = "failed";
    const failed = inputs.outcome.failed;
    errors.push({
      kind: "scenario",
      message: failed?.payload.reason ?? "scenario failed",
      ...(failed?.payload.stack ? { stack: failed.payload.stack } : {}),
      source: "automationExtension",
    });
  } else {
    const checks = inputs.outcome.completed?.payload.successChecks ?? [];
    const failedCheck = checks.find((c) => c.status === "failed");
    if (failedCheck) {
      status = "failed";
      errors.push({
        kind: "successCriterion",
        message: failedCheck.message ?? `success check failed: ${failedCheck.step}`,
        source: "automationExtension",
      });
    } else {
      status = "passed";
    }
    for (const check of checks) {
      validations.push({
        name: `success:${check.step}`,
        status: check.status === "passed" ? "passed" : "failed",
        ...(check.message ? { message: check.message } : {}),
      });
    }
  }

  // --- Official wall-clock (only from real markers) -------------------------
  const officialEligible = inputs.passType === "measurement" && status === "passed";
  if (start && end) {
    const { valueMs, timePlane } = markerPairDuration(start, end);
    metrics.push({
      name: "scenario.wallclock",
      value: valueMs,
      unit: "ms",
      component: "scenario",
      processRole: "boundary",
      source: "marker",
      official: officialEligible,
      lowerIsBetter: true,
      traceId: inputs.traceId,
      startUnixNs: start.timestampUnixNs,
      endUnixNs: end.timestampUnixNs,
      tags: { timePlane },
    });
  }

  // --- Declared marker-pair metrics (design §7 scenario metric definitions) --
  for (const metricSpec of inputs.spec?.metrics ?? []) {
    if (!metricSpec.beginMarker || !metricSpec.endMarker) {
      continue;
    }
    // Pair the LAST begin preceding the FIRST end: retry paths can emit
    // multiple begins (e.g. sts spawn re-attempts) and the tightest pair is
    // the honest duration of the attempt that completed.
    const endIndex = inputs.markers.findIndex((m) => m.name === metricSpec.endMarker);
    const endMarker = endIndex >= 0 ? inputs.markers[endIndex] : undefined;
    const begin =
      endIndex >= 0
        ? [...inputs.markers.slice(0, endIndex)]
            .reverse()
            .find((m) => m.name === metricSpec.beginMarker)
        : undefined;
    if (!begin || !endMarker) {
      // No fabrication: a declared metric whose markers were not observed is
      // simply absent, and that absence is recorded as a validation.
      validations.push({
        name: `metricMarkers:${metricSpec.name}`,
        status: "warning",
        message: `markers ${metricSpec.beginMarker}/${metricSpec.endMarker} not both observed`,
      });
      continue;
    }
    const { valueMs, timePlane } = markerPairDuration(begin, endMarker);
    metrics.push({
      name: metricSpec.name,
      value: valueMs,
      unit: "ms",
      component: metricSpec.component ?? "extension",
      processRole: metricSpec.processRole ?? begin.process.role,
      source: "marker",
      official: metricSpec.official && officialEligible,
      lowerIsBetter: metricSpec.lowerIsBetter ?? true,
      traceId: inputs.traceId,
      startUnixNs: begin.timestampUnixNs,
      endUnixNs: endMarker.timestampUnixNs,
      tags: { timePlane },
    });
  }

  // --- Counter-marker summaries (memory timelines etc., design M7) ---------
  // Counter markers carry a numeric attrs.value; summarize peak + final per
  // counter name. The full timeline stays in markers.jsonl.
  const counters = new Map<string, Array<{ value: number; marker: Marker }>>();
  for (const m of inputs.markers) {
    if (m.phase === "counter" && typeof m.attrs?.["value"] === "number") {
      const list = counters.get(m.name) ?? [];
      list.push({ value: m.attrs["value"], marker: m });
      counters.set(m.name, list);
    }
  }
  for (const [name, series] of counters) {
    const peak = Math.max(...series.map((s) => s.value));
    const final = series[series.length - 1]!.value;
    const isBytes = /memory|rss|heap/i.test(name);
    const scale = isBytes ? 1 / (1024 * 1024) : 1;
    const unit = isBytes ? "MB" : "count";
    const role = series[0]!.marker.process.role;
    metrics.push({
      name: `${name}.peak`,
      value: Number((peak * scale).toFixed(1)),
      unit,
      component: "process",
      processRole: role,
      source: "marker",
      official: false,
      lowerIsBetter: true,
      tags: { samples: series.length },
    });
    metrics.push({
      name: `${name}.final`,
      value: Number((final * scale).toFixed(1)),
      unit,
      component: "process",
      processRole: role,
      source: "marker",
      official: false,
      lowerIsBetter: true,
      tags: { samples: series.length },
    });
  }

  // Collector metrics: structurally incapable of being official (§12.2).
  for (const metric of inputs.extraMetrics ?? []) {
    metrics.push({ ...metric, official: false });
  }
  for (const validation of inputs.extraValidations ?? []) {
    validations.push(validation);
  }

  // --- Derived network/driver time (design §19.3) ---------------------------
  // Requires BOTH a client-side query span (product markers) and the
  // server-side XEvents total. Confidence is LOW until STS SqlClient timing
  // exists: the client span includes RPC transit, STS handling, and driver
  // work — the derivation says so instead of pretending precision.
  const clientQuery = metrics.find((m) => m.name === "mssql.query.toComplete");
  const serverDuration = metrics.find((m) => m.name === "sqlserver.duration");
  if (clientQuery && serverDuration && serverDuration.value >= 0) {
    metrics.push({
      name: "sql.networkDriver.duration",
      value: Number(Math.max(0, clientQuery.value - serverDuration.value).toFixed(3)),
      unit: "ms",
      component: "driver",
      processRole: "boundary",
      source: "derived",
      official: false,
      lowerIsBetter: true,
      confidence: "low",
      derivation: {
        formula: "max(0, mssql.query.toComplete - sqlserver.duration)",
        inputs: ["mssql.query.toComplete", "sqlserver.duration"],
        confidence: "low",
        limitations: [
          "client span includes JSON-RPC transit, STS handling, and driver work (no STS SqlClient timing yet)",
          "multiple statements in the window are summed on the server side",
          "async row streaming can overlap server and client time",
        ],
      },
    });
  }

  const result: PerfResult = {
    schemaVersion: 2,
    runId: inputs.runId,
    repId: inputs.repId,
    scenarioId: inputs.scenarioId,
    attemptId: inputs.attemptId,
    passType: inputs.passType,
    status,
    trace: { traceId: inputs.traceId, rootTraceparent: inputs.rootTraceparent },
    git: inputs.git,
    environment: inputs.environment,
    metrics,
    artifacts: inputs.artifacts,
    validations,
    errors,
  };

  // A result that fails its own schema is a harness bug — fail loudly. The
  // schema requires metrics to be non-empty; a rep with no markers gets a
  // metric-less placeholder that documents the absence explicitly.
  if (metrics.length === 0) {
    metrics.push({
      name: "harness.noOfficialSignal",
      value: 0,
      unit: "count",
      component: "harness",
      processRole: "orchestrator",
      source: "manual",
      official: false,
      lowerIsBetter: false,
      tags: { reason: "required markers missing; no timing can be derived" },
    });
  }
  const outcome = validateResult(result);
  if (!outcome.valid) {
    throw new Error(`Normalizer produced an invalid result.json: ${outcome.errors.join("; ")}`);
  }
  return result;
}

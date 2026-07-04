/**
 * @mssqlperf/observability-contracts — the Shared Observability Contract.
 *
 * One governed vocabulary for markers, spans, events, and metrics across
 * vscode-mssql, perftest, and (namespaced) STS. Consumers:
 *  - perftest: normalizer eligibility, scenario conformance tests
 *  - vscode-mssql: vendored generated snapshot + conformance tests
 *  - docs: generated EVENTS.md
 *
 * The registry does not force one physical record shape — markers,
 * DiagEvents, and STS spans stay structurally different. It defines the
 * SEMANTIC truth: what each name means, who may emit it, how it pairs, what
 * its fields are classified as, which timing plane applies, and whether it
 * may ever feed a measurement.
 */

import eventTypesJson from "./registry/event-types.json";
import classificationsJson from "./registry/classifications.json";
import timingClassesJson from "./registry/timing-classes.json";

export type TimingClass = "sameProcessMonotonic" | "epochAligned" | "derived";
export type EventKind =
  | "marker"
  | "webviewMark"
  | "event"
  | "metric"
  | "richMetric"
  | "spanFamily";
export type MarkerPhase = "begin" | "end" | "instant";

export interface EventTypeEntry {
  /** Exact canonical name (exclusive with prefix). */
  name?: string;
  /** Prefix for dynamically-named families (exclusive with name). */
  prefix?: string;
  kind: EventKind;
  phase?: MarkerPhase;
  /** Explicit pairing — suffix conventions vary and are never guessed. */
  pairsWith?: string;
  feature: string;
  processRoles: string[];
  timingClass: TimingClass;
  /** May a duration derived from this event ever be measurement-eligible? */
  measurementEligible: boolean;
  /** attr name -> classification id (see classifications.json). */
  attrs: Record<string, string>;
  /** Honesty flag: the attr list is known-partial while the registry matures. */
  attrsComplete: boolean;
  notes?: string;
  deprecated?: boolean;
}

export interface MetricNameEntry {
  name: string;
  feature: string;
  derivedFrom: string[];
}

export interface Registry {
  schemaVersion: string;
  events: EventTypeEntry[];
  metrics: MetricNameEntry[];
  classifications: Record<string, { examples: string[]; defaultBehavior: string }>;
  timingClasses: Record<string, { meaning: string; rendering: string; eligibility: string }>;
}

export function loadRegistry(): Registry {
  const events = eventTypesJson as unknown as {
    schemaVersion: string;
    events: EventTypeEntry[];
    metrics: MetricNameEntry[];
  };
  return {
    schemaVersion: events.schemaVersion,
    events: events.events,
    metrics: events.metrics,
    classifications: (
      classificationsJson as unknown as { classifications: Registry["classifications"] }
    ).classifications,
    timingClasses: (
      timingClassesJson as unknown as { timingClasses: Registry["timingClasses"] }
    ).timingClasses,
  };
}

// ---------------------------------------------------------------------------
// Name validation
// ---------------------------------------------------------------------------

export interface NameMatch {
  known: boolean;
  matchedBy?: "exact" | "prefix";
  entry?: EventTypeEntry;
}

/**
 * Resolve an emitted event/marker name against the registry. Span-family
 * members may carry `.begin`/`.end` phase suffixes (rpc.x/y.begin) — the
 * family prefix match covers them.
 */
export function explainEventName(name: string, registry?: Registry): NameMatch {
  const reg = registry ?? loadRegistry();
  const exact = reg.events.find((e) => e.name === name);
  if (exact) {
    return { known: true, matchedBy: "exact", entry: exact };
  }
  let best: EventTypeEntry | undefined;
  for (const entry of reg.events) {
    if (entry.prefix && name.startsWith(entry.prefix)) {
      if (!best || entry.prefix.length > (best.prefix?.length ?? 0)) {
        best = entry;
      }
    }
  }
  if (best) {
    return { known: true, matchedBy: "prefix", entry: best };
  }
  return { known: false };
}

export function isKnownMetricName(name: string, registry?: Registry): boolean {
  const reg = registry ?? loadRegistry();
  return reg.metrics.some((m) => m.name === name);
}

// ---------------------------------------------------------------------------
// Metric eligibility — the decision object that replaces overloaded
// `official`. Carried with every metric; rendered wherever the number is.
// ---------------------------------------------------------------------------

export type MetricEnvironment = "controlledHarness" | "interactiveHost" | "unknown";
export type TimePlane = "monotonic" | "epoch" | "calibrated" | "derived";
export type EligibilityPassType = "measurement" | "diagnostic" | "calibration";

export interface MetricEligibility {
  /** Derived from approved marker/product-timer sources under timing rules. */
  measurementEligible: boolean;
  /** Measurement-eligible AND produced in a controlled harness environment. */
  ciGatingEligible: boolean;
  /** Measurement-eligible but from an interactive host (self-test): useful, never a gate. */
  exploratory: boolean;
  /** Not measurement-eligible: collectors, epoch alignment, rich collection, diagnostic pass. */
  diagnosticOnly: boolean;
  timePlane: TimePlane;
  source: string;
  passType: EligibilityPassType;
  environment: MetricEnvironment;
  /** Machine-assembled explanation of the deciding factors. */
  reason: string;
}

export interface EligibilityInput {
  /** Metric source id (perftest MetricSource or equivalent). */
  source: string;
  passType: EligibilityPassType;
  environment: MetricEnvironment;
  timePlane: TimePlane;
  repStatus: "passed" | "failed" | "invalid" | "aborted";
  /** Rich collection active during the rep ⇒ diagnostic-only, always. */
  richCollection: boolean;
  /** Produced by a diagnostic collector ⇒ diagnostic-only, always. */
  fromCollector?: boolean;
  /**
   * Derived metrics (source "derived") are measurement-capable ONLY when a
   * derivation block declares formula + inputs (peer-review rule: derived
   * inherits the weakest input plane and requires provenance).
   */
  hasDerivation?: boolean;
}

const MEASUREMENT_SOURCES = new Set(["marker", "productTimer", "manual"]);

/**
 * The single shared eligibility decision. perftest's normalizer and the
 * in-proc self-test both call this so the rules cannot drift.
 *
 * Honesty rules (design §12.2 + peer-review terminology split):
 *  - only marker/product-timer sources can be measurement-eligible;
 *  - epoch-aligned durations are diagnostic-only ("calibrated" is reserved
 *    for the harness's clock-calibrated cross-process plane);
 *  - diagnostic/calibration passes never produce measurement metrics;
 *  - rich collection or collector provenance forces diagnostic-only;
 *  - only passed reps measure anything;
 *  - CI gating additionally requires the controlled harness environment;
 *  - an interactive host yields exploratory, never gating.
 */
export function deriveEligibility(input: EligibilityInput): MetricEligibility {
  const reasons: string[] = [];
  let measurement = true;

  const derivedWithProvenance = input.source === "derived" && input.hasDerivation === true;
  if (!MEASUREMENT_SOURCES.has(input.source) && !derivedWithProvenance) {
    measurement = false;
    reasons.push(
      input.source === "derived"
        ? "derived metric without a derivation block"
        : `source '${input.source}' is diagnostic`,
    );
  }
  if (input.timePlane === "epoch") {
    measurement = false;
    reasons.push("epoch-aligned timing is diagnostic-only");
  }
  if (input.passType !== "measurement") {
    measurement = false;
    reasons.push(`${input.passType} pass`);
  }
  if (input.repStatus !== "passed") {
    measurement = false;
    reasons.push(`rep ${input.repStatus}`);
  }
  if (input.richCollection) {
    measurement = false;
    reasons.push("rich collection was active");
  }
  if (input.fromCollector) {
    measurement = false;
    reasons.push("collector-produced");
  }

  if (measurement) {
    reasons.push(
      input.timePlane === "monotonic"
        ? `same-process monotonic from source '${input.source}'`
        : `${input.timePlane} plane from source '${input.source}'`,
    );
  }

  const ciGating = measurement && input.environment === "controlledHarness";
  const exploratory = measurement && input.environment === "interactiveHost";
  if (measurement && !ciGating) {
    reasons.push(
      input.environment === "interactiveHost"
        ? "interactive host — exploratory, never a gate"
        : "environment unknown — not gate-eligible",
    );
  }

  return {
    measurementEligible: measurement,
    ciGatingEligible: ciGating,
    exploratory,
    diagnosticOnly: !measurement,
    timePlane: input.timePlane,
    source: input.source,
    passType: input.passType,
    environment: input.environment,
    reason: reasons.join("; "),
  };
}

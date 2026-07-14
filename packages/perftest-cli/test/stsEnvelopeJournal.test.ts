import { describe, expect, it } from "vitest";
import { normalizeQueryCoordinatorStats, normalizeQueryPipelineStats } from "../src/collectors/stsEnvelopeJournal";

describe("stsEnvelopeJournal query pipeline normalization", () => {
  it("sums additive stats, keeps the maximum payload, and excludes correlation ids", () => {
    const metrics = normalizeQueryPipelineStats([
      {
        kind: "diag",
        type: "sts2.query.stats",
        payload: {
          status: "succeeded",
          pagesSent: 2,
          stats: {
            pages: 2,
            rows: 100,
            encodedBytes: 1_000,
            maxEventPayloadBytes: 700,
            rowsSerializeMsTotal: 1.25,
            postBuildAllocatedBytes: 4_000,
          },
        },
      },
      {
        kind: "diag",
        type: "sts2.query.stats",
        payload: {
          pagesSent: 3,
          stats: {
            pages: 3,
            rows: 150,
            encodedBytes: 2_000,
            maxEventPayloadBytes: 650,
            rowsSerializeMsTotal: 2.5,
            postBuildAllocatedBytes: 6_000,
          },
        },
      },
      { kind: "diag", type: "unrelated", payload: { stats: { rows: 999 } } },
    ]);

    const byName = new Map(metrics.map((metric) => [metric.name, metric]));
    expect(byName.get("sts2.query.pipeline.pagesSent")?.value).toBe(5);
    expect(byName.get("sts2.query.pipeline.rows")?.value).toBe(250);
    expect(byName.get("sts2.query.pipeline.encodedBytes")?.value).toBe(3_000);
    expect(byName.get("sts2.query.pipeline.maxEventPayloadBytes")?.value).toBe(700);
    expect(byName.get("sts2.query.pipeline.rowsSerializeMsTotal")?.value).toBe(3.75);
    expect(byName.get("sts2.query.pipeline.postBuildAllocatedBytes")?.value).toBe(10_000);
    expect(byName.get("sts2.query.pipeline.rows")?.tags).toEqual({
      samples: 2,
      derivedFrom: "sts2.query.stats",
    });
    expect(JSON.stringify(metrics)).not.toContain("queryId");
    expect(JSON.stringify(metrics)).not.toContain("connectionId");
  });

  it("normalizes post-driver coordinator stages without correlation tags", () => {
    const metrics = normalizeQueryCoordinatorStats([
      {
        kind: "metric",
        type: "sts2.query.coordinator.stats",
        payload: {
          queryId: "q-private-1",
          status: "completed",
          pages: 20,
          captureCanonicalBytes: 5_900_000,
          captureMsTotal: 80.25,
          captureAllocatedBytes: 17_000_000,
          outputActionMsTotal: 160.5,
          outputActionAllocatedBytes: 9_000_000,
        },
      },
      {
        kind: "metric",
        type: "sts2.query.coordinator.stats",
        payload: {
          queryId: "q-private-2",
          pages: 1,
          captureCanonicalBytes: 100,
          captureMsTotal: 0.25,
          captureAllocatedBytes: 1_000,
          outputActionMsTotal: 0.5,
          outputActionAllocatedBytes: 500,
        },
      },
    ]);

    const byName = new Map(metrics.map((metric) => [metric.name, metric]));
    expect(byName.get("sts2.query.coordinator.pages")?.value).toBe(21);
    expect(byName.get("sts2.query.coordinator.captureCanonicalBytes")?.value).toBe(5_900_100);
    expect(byName.get("sts2.query.coordinator.captureMsTotal")?.value).toBe(80.5);
    expect(byName.get("sts2.query.coordinator.captureAllocatedBytes")?.value).toBe(17_001_000);
    expect(byName.get("sts2.query.coordinator.outputActionMsTotal")?.tags).toEqual({
      samples: 2,
      derivedFrom: "sts2.query.coordinator.stats",
    });
    expect(JSON.stringify(metrics)).not.toContain("q-private");
  });
});

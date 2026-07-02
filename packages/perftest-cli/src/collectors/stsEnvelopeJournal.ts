/**
 * stsEnvelopeJournal collector (diagnostic pass only): harvests the sts2
 * envelope journal that SQL Tools Service writes when launched with
 * STS_ENABLE_STS2=1 (Karl's sts2 refactor: every RPC frame/effect/diagnostic
 * becomes a journaled envelope with gapless seq, ts, corr, cause).
 *
 * The harness builds on the journal as-is — no STS-side changes needed beyond
 * enabling the flag. After the rep exits, journal segments are copied into
 * the rep's artifacts and parsed into official:false RPC-latency metrics
 * (rpc.in.request → rpc.out.result/error matched by `corr`).
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactRef, Metric } from "@mssqlperf/contracts";
import type { Collector, CollectorContext } from "./types";

interface Envelope {
  seq?: number;
  ts?: string | number;
  kind?: string;
  type?: string;
  corr?: string | number;
}

export class StsEnvelopeJournalCollector implements Collector {
  readonly name = "stsEnvelopeJournal";
  readonly cost = "low" as const;
  readonly platforms = ["all"] as const as Array<"win32" | "linux" | "darwin" | "all">;
  // Journal capture is diagnostic-only until an overhead calibration approves it.
  readonly allowedPassTypes = ["diagnostic", "calibration"] as const as Array<
    "measurement" | "diagnostic" | "calibration"
  >;

  private startedAtMs = 0;
  private collectedEnvelopes: Envelope[] = [];

  async postLaunch(): Promise<void> {
    this.startedAtMs = Date.now();
  }

  async postExit(ctx: CollectorContext): Promise<ArtifactRef[]> {
    // sts2 journals land under the STS log directory: <log-dir>/sts2/<runId>/.
    // The extension points STS logs inside the rep's user-data dir, so scan
    // there for sts2 folders touched during this rep.
    const roots = [
      join(ctx.repDir, "vscode-user-data"),
      join(ctx.repDir, "..", "..", "profile", "vscode-user-data"), // warmed profile location
    ];
    const journalDirs: string[] = [];
    for (const root of roots) {
      if (existsSync(root)) {
        findSts2Dirs(root, journalDirs, 0);
      }
    }
    const fresh = journalDirs.filter((dir) => {
      try {
        return statSync(dir).mtimeMs >= this.startedAtMs - 5000;
      } catch {
        return false;
      }
    });
    if (fresh.length === 0) {
      ctx.logger.warn("stsEnvelopeJournal.noJournals", "no sts2 journal directories found", {
        searched: roots,
      });
      return [];
    }

    const artifacts: ArtifactRef[] = [];
    const outRoot = join(ctx.artifactsDir, "sts2");
    mkdirSync(outRoot, { recursive: true });
    for (const dir of fresh) {
      const name = dir.split(/[\\/]/).slice(-1)[0] ?? "journal";
      const dest = join(outRoot, name);
      try {
        cpSync(dir, dest, { recursive: true });
        artifacts.push({
          kind: "sts2Journal",
          path: `artifacts/sts2/${name}`,
          retention: "always",
        });
        for (const file of readdirSync(dest)) {
          if (file.endsWith(".jsonl")) {
            this.parseSegment(join(dest, file), ctx);
          }
        }
      } catch (error) {
        ctx.logger.warn("stsEnvelopeJournal.copyFailed", String(error), { dir });
      }
    }
    ctx.logger.info("stsEnvelopeJournal.collected", undefined, {
      journalDirs: fresh.length,
      envelopes: this.collectedEnvelopes.length,
    });
    return artifacts;
  }

  private parseSegment(path: string, ctx: CollectorContext): void {
    try {
      for (const line of readFileSync(path, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          this.collectedEnvelopes.push(JSON.parse(trimmed) as Envelope);
        } catch {
          // tolerate partial/corrupt trailing lines
        }
      }
    } catch (error) {
      ctx.logger.warn("stsEnvelopeJournal.parseFailed", String(error), { path });
    }
  }

  async normalize(ctx: CollectorContext): Promise<Metric[]> {
    // Match rpc.in.request → rpc.out.result|rpc.out.error by corr id and
    // derive per-method handler latency from envelope timestamps.
    const requests = new Map<string, { type: string; tsMs: number }>();
    const durations = new Map<string, number[]>();
    let unmatched = 0;
    for (const envelope of this.collectedEnvelopes) {
      const tsMs = parseTs(envelope.ts);
      if (tsMs === undefined || envelope.corr === undefined) continue;
      const corr = String(envelope.corr);
      if (envelope.kind === "rpc.in.request") {
        requests.set(corr, { type: envelope.type ?? "unknown", tsMs });
      } else if (envelope.kind === "rpc.out.result" || envelope.kind === "rpc.out.error") {
        const request = requests.get(corr);
        if (request) {
          const list = durations.get(request.type) ?? [];
          list.push(tsMs - request.tsMs);
          durations.set(request.type, list);
          requests.delete(corr);
        } else {
          unmatched++;
        }
      }
    }
    if (unmatched > 0) {
      ctx.logger.debug("stsEnvelopeJournal.unmatchedResponses", undefined, { unmatched });
    }
    const metrics: Metric[] = [];
    for (const [method, values] of durations) {
      const sorted = [...values].sort((a, b) => a - b);
      const median =
        sorted.length % 2 === 1
          ? sorted[(sorted.length - 1) / 2]!
          : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
      metrics.push({
        name: `sts.rpc.${method}.duration`,
        value: Number(median.toFixed(3)),
        unit: "ms",
        component: "sts",
        processRole: "sts",
        source: "otelSpan", // closest schema enum for span-derived server timing
        official: false,
        lowerIsBetter: true,
        tags: { samples: sorted.length, derivedFrom: "sts2EnvelopeJournal" },
      });
    }
    return metrics;
  }
}

function findSts2Dirs(root: string, results: string[], depth: number): void {
  if (depth > 6) return;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = join(root, entry.name);
    if (entry.name === "sts2") {
      // children are per-run journal dirs
      try {
        for (const child of readdirSync(full, { withFileTypes: true })) {
          if (child.isDirectory()) {
            results.push(join(full, child.name));
          }
        }
      } catch {
        // ignore
      }
    } else {
      findSts2Dirs(full, results, depth + 1);
    }
  }
}

function parseTs(ts: string | number | undefined): number | undefined {
  if (ts === undefined) return undefined;
  if (typeof ts === "number") {
    // Heuristic: ns > 1e15, µs > 1e12, ms > 1e9... journal uses one unit;
    // normalize to ms.
    if (ts > 1e17) return ts / 1e6;
    if (ts > 1e14) return ts / 1e3;
    return ts;
  }
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * cdpRendererTrace collector (Phase-2 M9, diagnostic only): Chromium trace of
 * the VS Code renderer across the scenario window, capturing paint/layout/
 * scripting work — including webview iframes (the results grid), which run
 * inside the renderer process.
 *
 * Mechanics: `--remote-debugging-port` (diagnostic launch flag), discover the
 * workbench page target via /json/list, Tracing.start on scenario.start with
 * rendering categories, Tracing.end on scenario.end, buffer
 * Tracing.dataCollected events → artifacts/renderer.trace.json
 * (Perfetto/chrome://tracing compatible).
 *
 * Honesty: if the renderer target can't be found, a validation warning is
 * recorded and NO metrics are emitted. Derived totals are renderer-process-
 * wide for the window (webview + workbench), tagged as such — never presented
 * as grid-only numbers.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactRef, Metric } from "@mssqlperf/contracts";
import type { Collector, CollectorContext, CollectorValidation, MutableLaunchSpec } from "./types";
import { CdpClient, discoverCdpTargets } from "./cdpClient";

const TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "blink",
  "blink.user_timing",
  "cc",
  "gpu",
  "loading",
  "v8",
  "toplevel",
];

interface TraceEvent {
  name?: string;
  ph?: string;
  dur?: number; // µs
  cat?: string;
}

export class CdpRendererTraceCollector implements Collector {
  readonly name = "cdpRendererTrace";
  readonly cost = "medium" as const;
  readonly platforms = ["all"] as const as Array<"win32" | "linux" | "darwin" | "all">;
  readonly allowedPassTypes = ["diagnostic"] as const as Array<
    "measurement" | "diagnostic" | "calibration"
  >;

  private port = 0;
  private client: CdpClient | undefined;
  private traceEvents: TraceEvent[] = [];
  private tracing = false;
  private targetFound = false;
  private failureReason: string | undefined;

  async preLaunch(ctx: CollectorContext, launch: MutableLaunchSpec): Promise<void> {
    this.port = 29000 + Math.floor(Math.random() * 10000);
    launch.args.push(`--remote-debugging-port=${this.port}`);
    ctx.logger.info("cdpRenderer.portRequested", undefined, { port: this.port });
  }

  async onScenarioStart(ctx: CollectorContext): Promise<void> {
    try {
      if (!this.client) {
        const targets = await discoverCdpTargets(this.port);
        // The workbench window is a page target on a vscode-file:// URL.
        const page =
          targets.find(
            (t) => t.type === "page" && (t.url ?? "").startsWith("vscode-file://"),
          ) ?? targets.find((t) => t.type === "page");
        if (!page?.webSocketDebuggerUrl) {
          this.failureReason = `no renderer page target among ${targets.length} CDP targets`;
          ctx.logger.warn("cdpRenderer.noTarget", this.failureReason, {
            targets: targets.map((t) => `${t.type}:${(t.url ?? "").slice(0, 60)}`),
          });
          return;
        }
        this.targetFound = true;
        this.client = new CdpClient();
        await this.client.connect(page.webSocketDebuggerUrl);
        this.client.on("Tracing.dataCollected", (params) => {
          const chunk = (params as { value?: TraceEvent[] })?.value;
          if (Array.isArray(chunk)) {
            this.traceEvents.push(...chunk);
          }
        });
      }
      await this.client.send("Tracing.start", {
        traceConfig: { includedCategories: TRACE_CATEGORIES, recordMode: "recordUntilFull" },
        transferMode: "ReportEvents",
      });
      this.tracing = true;
      ctx.logger.info("cdpRenderer.tracingStarted");
    } catch (error) {
      this.failureReason = String(error).slice(0, 300);
      ctx.logger.warn("cdpRenderer.startFailed", this.failureReason);
    }
  }

  async onScenarioEnd(ctx: CollectorContext): Promise<void> {
    if (!this.tracing || !this.client) {
      return;
    }
    try {
      const complete = new Promise<void>((resolve) => {
        this.client!.on("Tracing.tracingComplete", () => resolve());
        setTimeout(resolve, 30_000); // bounded wait for buffered chunks
      });
      await this.client.send("Tracing.end");
      await complete;
      this.tracing = false;
      ctx.logger.info("cdpRenderer.tracingStopped", undefined, {
        events: this.traceEvents.length,
      });
    } catch (error) {
      this.failureReason = String(error).slice(0, 300);
      ctx.logger.warn("cdpRenderer.stopFailed", this.failureReason);
    }
  }

  async postExit(ctx: CollectorContext): Promise<ArtifactRef[]> {
    this.client?.close();
    this.client = undefined;
    if (this.traceEvents.length === 0) {
      return [];
    }
    const path = join(ctx.artifactsDir, "renderer.trace.json");
    writeFileSync(path, JSON.stringify({ traceEvents: this.traceEvents }), "utf8");
    return [
      { kind: "cdpRendererTrace", path: "artifacts/renderer.trace.json", retention: "on-regression" },
    ];
  }

  async normalize(): Promise<Metric[]> {
    if (this.traceEvents.length === 0) {
      return [];
    }
    // Renderer-window totals from complete ("X") events, µs → ms. These are
    // process-wide for the scenario window — tagged so nobody mistakes them
    // for grid-only numbers.
    const totals = new Map<string, number>();
    let longestTaskUs = 0;
    for (const event of this.traceEvents) {
      if (event.ph !== "X" || typeof event.dur !== "number" || !event.name) {
        continue;
      }
      const bucket = classify(event.name);
      if (bucket) {
        totals.set(bucket, (totals.get(bucket) ?? 0) + event.dur);
      }
      if (event.name === "RunTask" && event.dur > longestTaskUs) {
        longestTaskUs = event.dur;
      }
    }
    const metrics: Metric[] = [];
    for (const [bucket, durUs] of totals) {
      metrics.push({
        name: `renderer.${bucket}.total`,
        value: Number((durUs / 1000).toFixed(2)),
        unit: "ms",
        component: "renderer",
        processRole: "renderer",
        source: "cdp",
        official: false,
        lowerIsBetter: true,
        tags: { scope: "rendererProcessWindow" },
      });
    }
    if (longestTaskUs > 0) {
      metrics.push({
        name: "renderer.longestTask",
        value: Number((longestTaskUs / 1000).toFixed(2)),
        unit: "ms",
        component: "renderer",
        processRole: "renderer",
        source: "cdp",
        official: false,
        lowerIsBetter: true,
        tags: { scope: "rendererProcessWindow" },
      });
    }
    return metrics;
  }

  postRunValidations(): CollectorValidation[] {
    if (this.failureReason) {
      return [
        { name: "rendererTraceCapture", status: "warning", message: this.failureReason },
      ];
    }
    if (this.targetFound && this.traceEvents.length > 0) {
      return [
        {
          name: "rendererTraceCapture",
          status: "passed",
          message: `${this.traceEvents.length} trace events`,
        },
      ];
    }
    return [];
  }
}

function classify(name: string): string | undefined {
  switch (name) {
    case "Paint":
    case "PaintImage":
    case "CompositeLayers":
    case "Commit":
      return "paint";
    case "Layout":
    case "UpdateLayoutTree":
    case "UpdateLayerTree":
    case "PrePaint":
      return "layout";
    case "FunctionCall":
    case "EvaluateScript":
    case "v8.run":
    case "V8.Execute":
      return "scripting";
    case "MinorGC":
    case "MajorGC":
    case "V8.GCScavenger":
      return "gc";
    default:
      return undefined;
  }
}

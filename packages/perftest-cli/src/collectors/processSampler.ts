/**
 * processSampler collector (design §14.3): low-cost CPU/RSS sampling of the
 * processes the harness owns (VS Code main + discovered children like the
 * extension host and STS). Measurement-approved as resource-only metrics —
 * never official scenario timing.
 *
 * Zero dependencies: samples come from PowerShell CIM on Windows and `ps`
 * elsewhere, at a gentle interval, entirely outside the product processes.
 */

import { execFile } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ArtifactRef, Metric } from "@mssqlperf/contracts";
import type { Collector, CollectorContext, PerfProcess, ProcessRegistry } from "./types";

const SAMPLE_INTERVAL_MS = 500;

interface ProcessSample {
  timestampUnixNs: string;
  pid: number;
  role: string;
  cpuSeconds: number;
  workingSetBytes: number;
}

export class ProcessSamplerCollector implements Collector {
  readonly name = "processSampler";
  readonly cost = "low" as const;
  readonly platforms = ["all"] as const as Array<"win32" | "linux" | "darwin" | "all">;
  readonly allowedPassTypes = ["measurement", "diagnostic", "calibration"] as const as Array<
    "measurement" | "diagnostic" | "calibration"
  >;

  private timer: NodeJS.Timeout | undefined;
  private processes: ProcessRegistry | undefined;
  private samplesPath: string | undefined;
  private readonly samples: ProcessSample[] = [];
  private sampling = false;

  async postLaunch(ctx: CollectorContext, processes: ProcessRegistry): Promise<void> {
    this.processes = processes;
    this.samplesPath = join(ctx.repDir, "process-samples.jsonl");
    mkdirSync(dirname(this.samplesPath), { recursive: true });
    this.timer = setInterval(() => {
      void this.sampleOnce(ctx);
    }, SAMPLE_INTERVAL_MS);
    this.timer.unref?.();
  }

  private async sampleOnce(ctx: CollectorContext): Promise<void> {
    if (this.sampling || !this.processes || !this.samplesPath) {
      return; // never let slow samples pile up
    }
    this.sampling = true;
    try {
      const targets = this.processes.all();
      if (targets.length === 0) {
        return;
      }
      const stats = await readProcessStats(targets.map((t) => t.pid));
      const now = (BigInt(Date.now()) * 1_000_000n).toString();
      for (const target of targets) {
        const stat = stats.get(target.pid);
        if (!stat) continue;
        const sample: ProcessSample = {
          timestampUnixNs: now,
          pid: target.pid,
          role: target.role,
          cpuSeconds: stat.cpuSeconds,
          workingSetBytes: stat.workingSetBytes,
        };
        this.samples.push(sample);
        appendFileSync(this.samplesPath, JSON.stringify(sample) + "\n");
      }
    } catch (error) {
      ctx.logger.debug("processSampler.sampleFailed", String(error));
    } finally {
      this.sampling = false;
    }
  }

  async preShutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async postExit(ctx: CollectorContext): Promise<ArtifactRef[]> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.samples.length === 0) {
      return [];
    }
    void ctx;
    return [
      {
        kind: "processSamples",
        path: "process-samples.jsonl",
        retention: "always",
      },
    ];
  }

  async normalize(): Promise<Metric[]> {
    const metrics: Metric[] = [];
    const byPid = new Map<number, ProcessSample[]>();
    for (const sample of this.samples) {
      const list = byPid.get(sample.pid) ?? [];
      list.push(sample);
      byPid.set(sample.pid, list);
    }
    for (const [pid, samples] of byPid) {
      const role = samples[0]!.role;
      const peakRss = Math.max(...samples.map((s) => s.workingSetBytes));
      const cpuDelta =
        samples.length > 1
          ? samples[samples.length - 1]!.cpuSeconds - samples[0]!.cpuSeconds
          : 0;
      metrics.push({
        name: "process.peakWorkingSet",
        value: Math.round(peakRss / 1024 / 1024),
        unit: "MB",
        component: "process",
        processRole: role,
        source: "processSampler",
        official: false,
        lowerIsBetter: true,
        tags: { pid, samples: samples.length },
      });
      metrics.push({
        name: "process.cpuTime",
        value: Number(cpuDelta.toFixed(3)),
        unit: "s",
        component: "process",
        processRole: role,
        source: "processSampler",
        official: false,
        lowerIsBetter: true,
        tags: { pid, samples: samples.length },
      });
    }
    return metrics;
  }
}

async function readProcessStats(
  pids: number[],
): Promise<Map<number, { cpuSeconds: number; workingSetBytes: number }>> {
  if (pids.length === 0) {
    return new Map();
  }
  if (process.platform === "win32") {
    return readStatsWindows(pids);
  }
  return readStatsPosix(pids);
}

function readStatsWindows(
  pids: number[],
): Promise<Map<number, { cpuSeconds: number; workingSetBytes: number }>> {
  const filter = pids.map((p) => `IdProcess=${p}`).join(" or ");
  const script =
    `Get-CimInstance Win32_PerfRawData_PerfProc_Process -Filter "${filter}" | ` +
    `Select-Object IdProcess,PercentProcessorTime,WorkingSetPrivate | ConvertTo-Json -Compress`;
  return new Promise((resolve) => {
    execFile(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { timeout: 10_000, windowsHide: true },
      (error, stdout) => {
        const map = new Map<number, { cpuSeconds: number; workingSetBytes: number }>();
        if (!error && stdout.trim()) {
          try {
            const parsed: unknown = JSON.parse(stdout);
            const rows = Array.isArray(parsed) ? parsed : [parsed];
            for (const row of rows as Array<Record<string, number>>) {
              map.set(Number(row["IdProcess"]), {
                // PercentProcessorTime raw value is 100ns units of CPU time.
                cpuSeconds: Number(row["PercentProcessorTime"] ?? 0) / 1e7,
                workingSetBytes: Number(row["WorkingSetPrivate"] ?? 0),
              });
            }
          } catch {
            // leave map empty; caller records a debug event
          }
        }
        resolve(map);
      },
    );
  });
}

function readStatsPosix(
  pids: number[],
): Promise<Map<number, { cpuSeconds: number; workingSetBytes: number }>> {
  return new Promise((resolve) => {
    execFile(
      "ps",
      ["-o", "pid=,time=,rss=", "-p", pids.join(",")],
      { timeout: 5_000 },
      (error, stdout) => {
        const map = new Map<number, { cpuSeconds: number; workingSetBytes: number }>();
        if (!error) {
          for (const line of stdout.split("\n")) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 3) continue;
            const [h = "0", m = "0", s = "0"] = (parts[1] ?? "").split(":").slice(-3);
            map.set(Number(parts[0]), {
              cpuSeconds: Number(h) * 3600 + Number(m) * 60 + Number(s),
              workingSetBytes: Number(parts[2]) * 1024,
            });
          }
        }
        resolve(map);
      },
    );
  });
}

/**
 * dotnetTrace collector (diagnostic pass only): EventPipe trace of the STS
 * process via the `dotnet-trace` global tool. Attaches when the STS pid is
 * discovered (product self-report marker) and finalizes naturally when STS
 * exits at rep teardown — no fragile console-signal games on Windows.
 * Missing tool ⇒ validation warning, never a corrupted rep (§A3.6).
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactRef } from "@mssqlperf/contracts";
import type { Collector, CollectorContext, CollectorValidation, PerfProcess } from "./types";

export class DotnetTraceCollector implements Collector {
  readonly name = "dotnetTrace";
  readonly cost = "high" as const;
  readonly platforms = ["all"] as const as Array<"win32" | "linux" | "darwin" | "all">;
  readonly allowedPassTypes = ["diagnostic"] as const as Array<
    "measurement" | "diagnostic" | "calibration"
  >;

  private available = false;
  private child: ChildProcess | undefined;
  private outputPath: string | undefined;

  async validate(ctx: CollectorContext): Promise<CollectorValidation[]> {
    try {
      execFileSync("dotnet-trace", ["--version"], {
        encoding: "utf8",
        timeout: 15_000,
        windowsHide: true,
        shell: process.platform === "win32",
      });
      this.available = true;
      return [{ name: "dotnetTraceAvailable", status: "passed" }];
    } catch {
      ctx.logger.warn("dotnetTrace.unavailable", "dotnet-trace not found; collector disabled");
      return [
        {
          name: "dotnetTraceAvailable",
          status: "warning",
          message: "dotnet-trace not installed (dotnet tool install -g dotnet-trace)",
        },
      ];
    }
  }

  async onProcessDiscovered(ctx: CollectorContext, perfProcess: PerfProcess): Promise<void> {
    if (!this.available || perfProcess.role !== "sts" || this.child) {
      return;
    }
    this.outputPath = join(ctx.artifactsDir, "sts.nettrace");
    ctx.logger.info("dotnetTrace.attach", undefined, { pid: perfProcess.pid });
    const toolLog = createWriteStream(join(ctx.artifactsDir, "dotnet-trace.log"));
    // No --profile flag: cpu-sampling is the collect default, and dotnet-trace 9
    // rejects naming it explicitly.
    this.child = spawn(
      "dotnet-trace",
      ["collect", "--process-id", String(perfProcess.pid), "-o", this.outputPath],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        shell: process.platform === "win32",
      },
    );
    this.child.stdout?.pipe(toolLog);
    this.child.stderr?.pipe(toolLog);
    this.child.on("error", (error) => {
      ctx.logger.warn("dotnetTrace.spawnFailed", String(error));
      this.child = undefined;
    });
    this.child.on("exit", (code) => {
      ctx.logger.info("dotnetTrace.exited", undefined, { code });
    });
  }

  async postExit(ctx: CollectorContext): Promise<ArtifactRef[]> {
    // STS has exited; dotnet-trace notices and finalizes the file. Give it a
    // bounded window, then stop waiting (partial traces are still useful).
    if (this.child && this.child.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.child?.kill();
          resolve();
        }, 20_000);
        this.child?.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this.child = undefined;
    if (!this.outputPath || !existsSync(this.outputPath)) {
      return [];
    }
    return [
      {
        kind: "dotnetTrace",
        path: "artifacts/sts.nettrace",
        retention: "on-regression",
        sizeBytes: statSync(this.outputPath).size,
      },
    ];
  }
}

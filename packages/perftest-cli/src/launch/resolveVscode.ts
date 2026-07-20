/**
 * VS Code acquisition (design §13.1): use @vscode/test-electron to download
 * and cache a pinned build, then hand the raw executable to the spawner —
 * the orchestrator owns the PID, stdio, env, and shutdown.
 */

import { downloadAndUnzipVSCode } from "@vscode/test-electron";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HarnessLogger } from "../telemetry/logger";

export interface ResolvedVscode {
  executablePath: string;
  /** Product CLI entrypoint used with ELECTRON_RUN_AS_NODE for extension install. */
  cliPath?: string;
  /** Actual product version (e.g. 1.102.1), from the build's product.json. */
  version: string;
  quality: string;
  commit?: string;
}

export async function resolveVscode(
  requestedVersion: string,
  logger: HarnessLogger,
): Promise<ResolvedVscode> {
  const span = logger.span("vscode.resolve", { requestedVersion });
  try {
    const executablePath = await downloadAndUnzipVSCode(requestedVersion);
    const product = readProductJson(executablePath);
    const cliPath = findVscodeCliPath(executablePath);
    const resolved: ResolvedVscode = {
      executablePath,
      ...(cliPath ? { cliPath } : {}),
      version: product?.version ?? requestedVersion,
      quality: product?.quality ?? "stable",
      ...(product?.commit !== undefined ? { commit: product.commit } : {}),
    };
    span.end({ executablePath, version: resolved.version });
    return resolved;
  } catch (error) {
    span.fail(error);
    throw error;
  }
}

export function findVscodeCliPath(executablePath: string): string | undefined {
  const root = dirname(executablePath);
  const candidates = [join(root, "resources", "app", "out", "cli.js")];
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        candidates.push(join(root, entry.name, "resources", "app", "out", "cli.js"));
      }
    }
  } catch {
    // Static candidate still applies.
  }
  return candidates.find((candidate) => existsSync(candidate));
}

interface ProductJson {
  version?: string;
  quality?: string;
  commit?: string;
}

function readProductJson(executablePath: string): ProductJson | undefined {
  // Classic layouts: <root>/resources/app/product.json (win/linux),
  // <root>/Contents/Resources/app/product.json (mac). Since ~1.127 the
  // Windows archive nests the app payload in a commit-named subdirectory:
  // <root>/<commitPrefix>/resources/app/product.json — so scan one level of
  // subdirectories as a fallback.
  const root = dirname(executablePath);
  const candidates = [
    join(root, "resources", "app", "product.json"),
    join(root, "..", "Resources", "app", "product.json"),
  ];
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        candidates.push(join(root, entry.name, "resources", "app", "product.json"));
      }
    }
  } catch {
    // fall through to whatever static candidates exist
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        return JSON.parse(readFileSync(candidate, "utf8")) as ProductJson;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

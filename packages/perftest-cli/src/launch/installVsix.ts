/**
 * Install packaged extensions into the exact isolated profile used by a rep.
 * This happens before VS Code launches, so installation time and CLI helper
 * processes never enter the measured scenario window.
 */

import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import type { HarnessLogger } from "../telemetry/logger";
import { buildChildEnv } from "./spawnVscode";

export interface ResolvedVsixExtension {
  id: string;
  path: string;
  version: string;
}

export function buildVsixInstallArgs(
  extensionPath: string,
  userDataDir: string,
  extensionsDir: string,
): string[] {
  return [
    "--install-extension",
    extensionPath,
    "--force",
    "--extensions-dir",
    extensionsDir,
    "--user-data-dir",
    userDataDir,
  ];
}

export async function installVsixExtensions(options: {
  executablePath: string;
  cliPath?: string;
  userDataDir: string;
  extensionsDir: string;
  extensions: readonly ResolvedVsixExtension[];
  logger: HarnessLogger;
}): Promise<void> {
  if (options.extensions.length === 0) return;
  if (!options.cliPath) {
    throw new Error("The resolved VS Code build has no CLI entrypoint for VSIX installation");
  }
  mkdirSync(options.userDataDir, { recursive: true });
  mkdirSync(options.extensionsDir, { recursive: true });

  for (const extension of options.extensions) {
    const span = options.logger.span("vscode.installVsix", {
      extensionId: extension.id,
      extensionVersion: extension.version,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(
          options.executablePath,
          [
            options.cliPath!,
            ...buildVsixInstallArgs(extension.path, options.userDataDir, options.extensionsDir),
          ],
          {
            // This is deliberately the CLI mode used by code.cmd/code.sh,
            // not the desktop process mode used by the measured launch.
            env: buildChildEnv({ ELECTRON_RUN_AS_NODE: "1" }),
            timeout: 180_000,
            windowsHide: true,
            maxBuffer: 4 * 1024 * 1024,
          },
          (error, stdout, stderr) => {
            if (error) {
              reject(
                new Error(
                  `Failed to install ${extension.id}@${extension.version}: ${stderr.trim() || stdout.trim() || error.message}`,
                ),
              );
              return;
            }
            resolve();
          },
        );
      });
      span.end();
    } catch (error) {
      span.fail(error);
      throw error;
    }
  }
}

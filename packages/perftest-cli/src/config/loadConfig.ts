/**
 * Config loading (design §25): JSONC parse → JSON Schema validation →
 * normalized PerfConfig with resolved runId. The raw text and parsed snapshot
 * are kept so each run can persist its exact config (reproducibility rule §A3.3).
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parse as parseJsonc, printParseErrorCode, type ParseError } from "jsonc-parser";
import { newRunId, validateConfig, type PerfConfig } from "@mssqlperf/contracts";

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface LoadedConfig {
  config: PerfConfig;
  /** Resolved run id ("auto" replaced with a fresh id). */
  runId: string;
  /** sha256 of the raw config text. */
  configHash: string;
  configPath: string;
  rawText: string;
}

export function parseJsoncStrict(text: string, sourcePath: string): unknown {
  const errors: ParseError[] = [];
  const data: unknown = parseJsonc(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0) {
    throw new ConfigError(
      `Failed to parse ${sourcePath}`,
      errors.map((e) => `${printParseErrorCode(e.error)} at offset ${e.offset}`),
    );
  }
  return data;
}

export function loadConfig(configPath: string): LoadedConfig {
  let rawText: string;
  try {
    rawText = readFileSync(configPath, "utf8");
  } catch (error) {
    throw new ConfigError(`Cannot read config file ${configPath}: ${String(error)}`);
  }

  const data = parseJsoncStrict(rawText, configPath);
  const outcome = validateConfig(data);
  if (!outcome.valid) {
    throw new ConfigError(`Config ${configPath} failed schema validation`, outcome.errors);
  }

  const config = data as PerfConfig;
  const runId = !config.runId || config.runId === "auto" ? newRunId() : config.runId;
  const configHash = "sha256:" + createHash("sha256").update(rawText, "utf8").digest("hex");

  return { config, runId, configHash, configPath, rawText };
}

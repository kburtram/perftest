/**
 * Minimal Chrome DevTools Protocol client over WebSocket: request/response
 * with ids, plus event subscription. Shared by the renderer tracing collector
 * (and future CDP collectors).
 */

import { request as httpRequest } from "node:http";
import WebSocket from "ws";

export interface CdpTarget {
  id?: string;
  type?: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

export function listCdpTargets(port: number, timeoutMs = 2000): Promise<CdpTarget[]> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path: "/json/list", timeout: timeoutMs },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body) as CdpTarget[]);
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`CDP /json/list timed out on port ${port}`));
    });
    req.end();
  });
}

export async function discoverCdpTargets(
  port: number,
  retries = 20,
  delayMs = 500,
): Promise<CdpTarget[]> {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const targets = await listCdpTargets(port);
      if (targets.length > 0) {
        return targets;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`No CDP targets on port ${port}: ${String(lastError ?? "empty list")}`);
}

export class CdpClient {
  private socket: WebSocket | undefined;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >();
  private readonly eventHandlers = new Map<string, Array<(params: unknown) => void>>();

  connect(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
      this.socket = socket;
      socket.on("open", () => resolve());
      socket.on("error", (error) => reject(error));
      socket.on("message", (data) => {
        try {
          const message = JSON.parse(String(data)) as {
            id?: number;
            result?: unknown;
            error?: { message?: string };
            method?: string;
            params?: unknown;
          };
          if (message.id !== undefined) {
            const pending = this.pending.get(message.id);
            if (pending) {
              this.pending.delete(message.id);
              if (message.error) {
                pending.reject(new Error(message.error.message ?? "CDP error"));
              } else {
                pending.resolve(message.result);
              }
            }
          } else if (message.method) {
            for (const handler of this.eventHandlers.get(message.method) ?? []) {
              handler(message.params);
            }
          }
        } catch {
          // ignore unparseable frames
        }
      });
    });
  }

  on(method: string, handler: (params: unknown) => void): void {
    const list = this.eventHandlers.get(method) ?? [];
    list.push(handler);
    this.eventHandlers.set(method, list);
  }

  send(method: string, params?: Record<string, unknown>, timeoutMs = 30_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        reject(new Error("CDP socket not open"));
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP call ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, ...(params ? { params } : {}) }));
    });
  }

  close(): void {
    this.socket?.close();
    this.socket = undefined;
  }
}

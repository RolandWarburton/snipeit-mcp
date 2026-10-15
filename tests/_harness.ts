/**
 * Test harness: drives real tool handlers against a stubbed `globalThis.fetch`,
 * so tests assert on the exact HTTP request the port produces (method, URL path,
 * query, JSON body) - a stronger check than the Python tests, which mocked at
 * the api._request layer.
 *
 * `callTool` parses args through the tool's own zod inputSchema first (applying
 * defaults/coercion exactly as the MCP SDK would) before invoking the handler.
 */

import { z } from "zod";
import { SnipeITClient } from "../src/client.ts";
import type { ToolDef } from "../src/tool.ts";

export const TEST_URL = "https://test.snipeit.com";

export function makeClient(): SnipeITClient {
  return new SnipeITClient(TEST_URL, "test-token");
}

export function toolMap(defs: ToolDef[]): Record<string, ToolDef> {
  return Object.fromEntries(defs.map((d) => [d.name, d]));
}

export interface Captured {
  method: string;
  url: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Headers;
}

export interface StubResp {
  json?: unknown;
  bytes?: Uint8Array;
  contentType?: string;
  status?: number;
}

/** Replace globalThis.fetch with a stub that records requests and returns queued responses. */
export function stubFetch(responses: StubResp[]) {
  const captured: Captured[] = [];
  let i = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input as Request, init);
    const u = new URL(req.url);
    let body: unknown = undefined;
    const text = await req.clone().text().catch(() => "");
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text; // multipart / non-JSON
      }
    }
    captured.push({ method: req.method, url: req.url, path: u.pathname, query: u.searchParams, body, headers: req.headers });
    const r = responses[i++] ?? { json: {} };
    const status = r.status ?? 200;
    if (r.bytes) {
      return new Response(r.bytes as BodyInit, {
        status,
        headers: r.contentType ? { "content-type": r.contentType } : {},
      });
    }
    return new Response(JSON.stringify(r.json ?? {}), {
      status,
      headers: { "content-type": r.contentType ?? "application/json" },
    });
  }) as typeof fetch;
  return { captured, restore: () => { globalThis.fetch = original; } };
}

/** Run `fn` with a stubbed fetch, always restoring afterward. */
export async function withStub(
  responses: StubResp[],
  fn: (captured: Captured[]) => Promise<void>,
): Promise<void> {
  const { captured, restore } = stubFetch(responses);
  try {
    await fn(captured);
  } finally {
    restore();
  }
}

/** Parse args through the tool's inputSchema (SDK-equivalent) then call the handler. */
export async function callTool(
  tool: ToolDef,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const parsed = z.object(tool.inputSchema).parse(args);
  const res = await tool.handler(parsed as Record<string, unknown>);
  return JSON.parse(res.content[0].text) as Record<string, unknown>;
}

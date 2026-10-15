/**
 * Entry point for the Snipe-IT MCP server (Deno, API-key mode).
 *
 * Ordering mirrors the Python entry point:
 * 1. Load + validate config from the environment (fail fast on misconfig).
 * 2. Build the shared fetch client and the McpServer with its tools.
 * 3. Run on the chosen transport:
 *    - stdio  → StdioServerTransport (no HTTP server).
 *    - http   → Deno.serve routing POST/GET/DELETE /mcp to the SDK's
 *               WebStandardStreamableHTTPServerTransport (stateless mode).
 *
 * All diagnostics go to stderr - stdout is reserved for the stdio JSON-RPC
 * stream and must never be written to directly.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ConfigError, loadConfig } from "./config.ts";
import { SnipeITClient } from "./client.ts";
import { buildServer } from "./server.ts";
import { Authenticator } from "./auth.ts";

const PRM_PATH = "/.well-known/oauth-protected-resource";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const log = (...args: unknown[]) => console.error("[snipeit-mcp]", ...args);

async function main(): Promise<void> {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`Configuration error: ${e.message}`);
      Deno.exit(2);
    }
    throw e;
  }

  const client = new SnipeITClient(cfg.url, cfg.token);

  if (cfg.transport === "http") {
    // Log the tool registration once at startup (per-request builds are quiet).
    buildServer(client, cfg.allowedTools);

    const auth = cfg.auth.enabled ? new Authenticator(cfg.auth) : undefined;

    log(
      `Starting Snipe-IT MCP Server (HTTP, API-key mode) on ` +
        `http://${cfg.host}:${cfg.port}/mcp` +
        (auth ? ` [OAuth gate: on, issuer ${cfg.auth.issuer}]` : ""),
    );

    Deno.serve({ hostname: cfg.host, port: cfg.port! }, async (req) => {
      const { pathname } = new URL(req.url);

      // Protected Resource Metadata (RFC 9728) - always unauthenticated.
      if (auth && pathname === PRM_PATH) {
        return jsonResponse(auth.protectedResourceMetadata());
      }

      // Liveness probe for the container healthcheck - always unauthenticated,
      // and deliberately touches nothing upstream: it answers for this process,
      // not for Snipe-IT.
      if (pathname === "/health") return jsonResponse({ status: "ok" });

      if (pathname !== "/mcp") return new Response("Not Found", { status: 404 });

      // Gate every /mcp method uniformly (including the initialize handshake):
      // once Claude has a token it sends it on every request.
      if (auth) {
        const result = await auth.authorize(req);
        if (!result.ok) {
          if (result.status === 403) {
            return new Response("Forbidden", { status: 403 });
          }
          return new Response("Unauthorized", {
            status: 401,
            headers: { "WWW-Authenticate": auth.challengeHeader() },
          });
        }
      }

      // Stateless mode: a fresh server + transport per request. The transport
      // rejects reuse across requests, and this keeps concurrent requests from
      // sharing JSON-RPC id state.
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      const reqServer = buildServer(client, cfg.allowedTools, true);
      await reqServer.connect(transport);
      return await transport.handleRequest(req);
    });
  } else {
    const server = buildServer(client, cfg.allowedTools);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log("Snipe-IT MCP Server ready (stdio, API-key mode)");
  }
}

if (import.meta.main) {
  await main();
}

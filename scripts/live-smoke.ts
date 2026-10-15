/**
 * Live smoke test - drives the real MCP server over stdio against a live
 * Snipe-IT, using the official MCP SDK client (no mocks, no third-party tools).
 *
 * The StdioClientTransport spawns `deno run src/main.ts` as a subprocess and
 * speaks JSON-RPC over its stdin/stdout, so this exercises the real entry point,
 * config loading, transport, and client.ts - end to end.
 *
 * Run:
 *   deno run --env-file=.env -A scripts/live-smoke.ts
 *
 * Notes:
 * - .env's SNIPEIT_URL is `http://snipeit` (docker-internal, unreachable from
 *   the host). We override it to the public URL for this host-run test. Override
 *   on the CLI:  SNIPEIT_URL=... deno run ... scripts/live-smoke.ts
 * - Only read-only tools are called; nothing mutates Snipe-IT.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SNIPEIT_URL = Deno.env.get("SNIPEIT_URL_OVERRIDE") ??
  "https://snipeit.example.com";

function line(label: string) {
  console.error(`\n${"=".repeat(8)} ${label} ${"=".repeat(8)}`);
}

const transport = new StdioClientTransport({
  command: "deno",
  args: [
    "run",
    "--allow-net",
    "--allow-env",
    "--allow-read",
    "--allow-write",
    "src/main.ts",
  ],
  // The subprocess inherits our env (so SNIPEIT_TOKEN from --env-file flows
  // through) but we pin SNIPEIT_URL to a host-reachable address and force stdio.
  // MCP_AUTH is forced off: the OAuth gate is HTTP-only, and inheriting
  // MCP_AUTH=true from .env would fail config validation under stdio.
  env: {
    ...Deno.env.toObject(),
    SNIPEIT_URL,
    MCP_TRANSPORT: "stdio",
    MCP_AUTH: "false",
  },
  stderr: "inherit", // surface the server's [snipeit-mcp] diagnostics
});

const client = new Client({ name: "live-smoke", version: "0.1.0" });

try {
  line(`connecting (SNIPEIT_URL=${SNIPEIT_URL})`);
  await client.connect(transport); // performs the initialize handshake
  console.error("connected; server capabilities negotiated");

  line("tools/list");
  const tools = await client.listTools();
  console.error(`${tools.tools.length} tools registered:`);
  for (const t of tools.tools) console.error(`  - ${t.name}`);

  line("call: system_info");
  const info = await client.callTool({ name: "system_info", arguments: {} });
  console.error(JSON.stringify(info, null, 2));

  line("call: manage_assets { action: list, limit: 3 }");
  const assets = await client.callTool({
    name: "manage_assets",
    arguments: { action: "list", limit: 3 },
  });
  console.error(JSON.stringify(assets, null, 2));

  line("done");
} finally {
  await client.close();
}

/**
 * Server/whitelist tests - port of the TestToolWhitelist cases in test_core.py.
 * Builds the real McpServer, connects an in-memory client, and lists tools -
 * exercising the SNIPEIT_ALLOWED_TOOLS registration filter end-to-end.
 */

import { assert, assertEquals, assertRejects } from "@std/assert";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.ts";
import { makeClient } from "./_harness.ts";

async function listToolNames(allowed?: Set<string>): Promise<string[]> {
  const server = buildServer(makeClient(), allowed);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((t: { name: string }) => t.name);
}

Deno.test("no whitelist → all 37 tools", async () => {
  const names = await listToolNames();
  assertEquals(names.length, 37);
});

Deno.test("whitelist limits to the named tools", async () => {
  const names = await listToolNames(new Set(["manage_assets", "system_info"]));
  assertEquals(new Set(names), new Set(["manage_assets", "system_info"]));
});

Deno.test("whitelist excluding all tools → tools capability not advertised", async () => {
  // Divergence from the Python/FastMCP server (which returned an empty list):
  // the TS SDK's McpServer only declares the `tools` capability once at least
  // one tool is registered, so an all-excluding whitelist leaves `tools/list`
  // unsupported (-32601). This is a degenerate config; documented here.
  const server = buildServer(makeClient(), new Set(["nonexistent_tool"]));
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
  await assertRejects(() => client.listTools());
  await client.close();
});

Deno.test("every registered tool has a description and input schema", async () => {
  const server = buildServer(makeClient());
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
  const { tools } = await client.listTools();
  for (const t of tools as Array<{ name: string; description?: string; inputSchema?: { type?: string } }>) {
    assert(typeof t.description === "string" && t.description.length > 0, `${t.name} missing description`);
    assert(t.inputSchema?.type === "object", `${t.name} inputSchema not object`);
  }
  await client.close();
});

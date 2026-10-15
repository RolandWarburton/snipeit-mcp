/**
 * Builds the McpServer and registers tools, applying the optional
 * SNIPEIT_ALLOWED_TOOLS whitelist by filtering on tool name at registration
 * time (the Deno-native equivalent of FastMCP's enable/disable visibility).
 *
 * To add the remaining modules from the Python server, import their
 * `<name>Tools(client)` factories and spread them into `defs`.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SnipeITClient } from "./client.ts";
import type { ToolDef } from "./tool.ts";
import { assetsTools } from "./tools/assets.ts";
import { customFieldsTools } from "./tools/custom_fields.ts";
import { foundationalTools } from "./tools/foundational.ts";
import { importsTools } from "./tools/imports.ts";
import { inventoryTools } from "./tools/inventory.ts";
import { licensesTools } from "./tools/licenses.ts";
import { peopleTools } from "./tools/people.ts";
import { reportsTools } from "./tools/reports.ts";
import { systemTools } from "./tools/system.ts";

export function buildServer(
  client: SnipeITClient,
  allowedTools?: Set<string>,
  quiet = false,
): McpServer {
  const server = new McpServer({
    name: "Snipe-IT MCP Server",
    version: "0.1.0",
  });

  const defs: ToolDef[] = [
    ...systemTools(client),
    ...assetsTools(client),
    ...foundationalTools(client),
    ...inventoryTools(client),
    ...peopleTools(client),
    ...licensesTools(client),
    ...customFieldsTools(client),
    ...reportsTools(client),
    ...importsTools(client),
  ];

  let registered = 0;
  for (const def of defs) {
    if (allowedTools && !allowedTools.has(def.name)) continue;
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: def.annotations,
      },
      def.handler,
    );
    registered++;
  }

  if (!quiet) {
    console.error(
      `[snipeit-mcp] Registered ${registered} tool(s)` +
        (allowedTools ? ` (whitelist: ${[...allowedTools].sort().join(", ")})` : ""),
    );
  }

  return server;
}

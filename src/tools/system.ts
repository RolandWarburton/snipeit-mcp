/**
 * Snipe-IT system administration tools - TypeScript port of `tools/system.py`.
 * Three tools: system_info, manage_backups, ldap_operations.
 */

import { z } from "zod";
import type { SnipeITClient } from "../client.ts";
import { guarded, type ToolDef } from "../tool.ts";

export function systemTools(client: SnipeITClient): ToolDef[] {
  return [
    {
      name: "system_info",
      description:
        "Get Snipe-IT system information. Returns version and installation " +
        "details, useful for compatibility checking and deployment verification.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      handler: guarded("system_info", async () => {
        const versionInfo = await client.request("GET", "version");
        return { success: true, version_info: versionInfo };
      }),
    },

    {
      name: "manage_backups",
      description:
        "Manage Snipe-IT database backups.\n" +
        "- list: List available database backup files\n" +
        "- download: Download a specific backup file to save_path\n" +
        "Note: backup creation is triggered via the web UI or CLI, not the API.",
      inputSchema: {
        action: z.enum(["list", "download"]).describe(
          "The backup action to perform",
        ),
        filename: z.string().optional().describe(
          "Backup filename (for download)",
        ),
        save_path: z.string().optional().describe(
          "Local path to save backup (for download)",
        ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      handler: guarded("manage_backups", async (args) => {
        const action = args.action as "list" | "download";

        if (action === "list") {
          const result = await client.request("GET", "settings/backups");
          const backups = result.rows ?? result.backups ?? [];
          return { success: true, action: "list", backups };
        }

        // download
        const filename = args.filename as string | undefined;
        const savePath = args.save_path as string | undefined;
        if (!filename) {
          return { success: false, error: "filename is required for download action" };
        }
        if (!savePath) {
          return { success: false, error: "save_path is required for download action" };
        }

        const url =
          `${client.baseUrl}/api/v1/settings/backups/download/${filename}`;
        const res = await fetch(url, {
          headers: {
            Authorization: client.authHeader,
            Accept: "application/octet-stream",
          },
        });
        if (!res.ok) {
          return { success: false, error: `Download failed: HTTP ${res.status}` };
        }

        const dir = savePath.replace(/\/[^/]*$/, "");
        if (dir && dir !== savePath) {
          await Deno.mkdir(dir, { recursive: true }).catch(() => {});
        }
        await Deno.writeFile(savePath, new Uint8Array(await res.arrayBuffer()));

        return {
          success: true,
          action: "download",
          filename,
          saved_to: savePath,
          message: `Backup downloaded to ${savePath}`,
        };
      }),
    },

    {
      name: "ldap_operations",
      description:
        "Manage LDAP synchronization.\n" +
        "- sync: Trigger LDAP user synchronization\n" +
        "- test: Test LDAP connection settings\n" +
        "Note: LDAP must be configured in Snipe-IT settings before use.",
      inputSchema: {
        action: z.enum(["sync", "test"]).describe("The LDAP action to perform"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      handler: guarded("ldap_operations", async (args) => {
        const action = args.action as "sync" | "test";
        if (action === "sync") {
          // LDAP sync lives under users, not settings (only the test endpoints
          // are on the settings prefix).
          const result = await client.request("POST", "users/ldapsync");
          return { success: true, action: "sync", message: "LDAP sync triggered", result };
        }
        const result = await client.request("GET", "settings/ldaptest");
        return { success: true, action: "test", result };
      }),
    },
  ];
}

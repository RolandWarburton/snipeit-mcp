/**
 * Snipe-IT import tools - TypeScript port of `tools/imports.py`.
 * One tool: manage_imports (CSV import workflow: upload → update mappings →
 * process). All direct-API; upload is multipart with a text/csv `file` field.
 */

import { z } from "zod";
import { type SnipeITClient } from "../client.ts";
import { guarded, type ToolDef } from "../tool.ts";
import { basename, compact, type Row } from "../util.ts";
import { type ImportData, importDataSchema } from "../schemas.ts";

export function importsTools(client: SnipeITClient): ToolDef[] {
  return [
    {
      name: "manage_imports",
      description:
        "Manage CSV import operations (workflow: upload → update mappings → process).\n" +
        "- list: list all import files\n" +
        "- get: import file details incl. column mappings\n" +
        "- upload: upload a CSV file\n" +
        "- update: update column mappings/settings\n" +
        "- delete: delete an import file\n" +
        "- process: execute the import",
      inputSchema: {
        action: z.enum(["list", "get", "upload", "update", "delete", "process"]).describe(
          "The import action to perform",
        ),
        import_id: z.number().int().optional().describe(
          "Import file ID (required for get, update, delete, process)",
        ),
        file_path: z.string().optional().describe("Path to CSV file (required for upload action)"),
        import_data: importDataSchema.optional().describe("Import configuration (for update action)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_imports", async (args) => {
        const action = args.action as string;
        const importId = args.import_id as number | undefined;

        if (action === "list") {
          const result = await client.request("GET", "imports");
          const imports = (result.rows as Row[]) ?? [];
          return { success: true, action: "list", count: imports.length, imports };
        }

        if (action === "get") {
          if (!importId) return { success: false, error: "import_id is required for get action" };
          return { success: true, action: "get", import: await client.request("GET", `imports/${importId}`) };
        }

        if (action === "upload") {
          const filePath = args.file_path as string | undefined;
          if (!filePath) return { success: false, error: "file_path is required for upload action" };
          let bytes: Uint8Array;
          try {
            bytes = await Deno.readFile(filePath);
          } catch {
            return { success: false, error: `File not found: ${filePath}` };
          }
          const filename = basename(filePath);
          const form = new FormData();
          form.append("file", new Blob([bytes as BlobPart], { type: "text/csv" }), filename);
          const res = await fetch(`${client.baseUrl}/api/v1/imports`, {
            method: "POST",
            headers: { Authorization: client.authHeader, Accept: "application/json" },
            body: form,
          });
          if (!res.ok) return { success: false, error: `Upload failed: HTTP ${res.status}` };
          const result = await res.json();
          return {
            success: true,
            action: "upload",
            message: `File '${filename}' uploaded successfully`,
            import: result,
          };
        }

        if (action === "update") {
          if (!importId) return { success: false, error: "import_id is required for update action" };
          const importData = args.import_data as ImportData | undefined;
          if (!importData) return { success: false, error: "import_data is required for update action" };
          const result = await client.request("PATCH", `imports/${importId}`, {
            json: compact({ ...importData }),
          });
          return { success: true, action: "update", import_id: importId, result };
        }

        if (action === "delete") {
          if (!importId) return { success: false, error: "import_id is required for delete action" };
          await client.request("DELETE", `imports/${importId}`);
          return { success: true, action: "delete", import_id: importId, message: "Import file deleted successfully" };
        }

        // process
        if (!importId) return { success: false, error: "import_id is required for process action" };
        const result = await client.request("POST", `imports/process/${importId}`);
        return { success: true, action: "process", import_id: importId, message: "Import processed", result };
      }),
    },
  ];
}

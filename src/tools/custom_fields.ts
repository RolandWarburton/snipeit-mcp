/**
 * Snipe-IT custom field tools - TypeScript port of `tools/custom_fields.py`.
 * Two tools: manage_fields (+associate/disassociate), manage_fieldsets
 * (+fields listing, reorder). All direct-API.
 */

import { z } from "zod";
import { paginationMeta, type SnipeITClient } from "../client.ts";
import { guarded, type ToolDef } from "../tool.ts";
import { compact, pick, type Row } from "../util.ts";
import {
  type FieldData,
  fieldDataSchema,
  type FieldsetData,
  fieldsetDataSchema,
} from "../schemas.ts";

export function customFieldsTools(client: SnipeITClient): ToolDef[] {
  return [
    {
      name: "manage_fields",
      description:
        "Manage Snipe-IT custom fields with CRUD plus fieldset association.\n" +
        "- create/get/list/update/delete\n" +
        "- associate: attach a field to a fieldset\n" +
        "- disassociate: remove a field from a fieldset\n" +
        "Requires name and element to create.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete", "associate", "disassociate"]).describe(
          "The action to perform on custom fields",
        ),
        field_id: z.number().int().optional().describe(
          "Field ID (required for get, update, delete, associate, disassociate)",
        ),
        field_data: fieldDataSchema.optional().describe(
          "Field data (required for create, optional for update)",
        ),
        fieldset_id: z.number().int().optional().describe(
          "Fieldset ID (required for associate/disassociate actions)",
        ),
        limit: z.number().int().default(50).describe("Number of results to return (list)"),
        offset: z.number().int().default(0).describe("Number of results to skip (list)"),
        search: z.string().optional().describe("Search query (list)"),
        required: z.boolean().optional().default(false).describe(
          "Whether field is required in fieldset (for associate action)",
        ),
        order: z.number().int().optional().describe("Display order in fieldset (for associate action)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_fields", async (args) => {
        const action = args.action as string;
        const fieldId = args.field_id as number | undefined;
        const fieldsetId = args.fieldset_id as number | undefined;
        const data = args.field_data as FieldData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "field_data is required for create action" };
          if (!data.name || !data.element) {
            return { success: false, error: "name and element are required to create a field" };
          }
          return { success: true, action: "create", field: await client.create("fields", compact({ ...data })) };
        }
        if (action === "get") {
          if (!fieldId) return { success: false, error: "field_id is required for get action" };
          return { success: true, action: "get", field: await client.get("fields", fieldId) };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("fields", {
            limit: args.limit as number,
            offset: args.offset as number,
            search: args.search as string | undefined,
          });
          const fields = rows.map((f) =>
            pick(f, ["id", "name", "db_column_name", "element", "format", "field_encrypted"])
          );
          return {
            success: true,
            action: "list",
            ...paginationMeta(fields.length, total, args.limit as number, args.offset as number),
            fields,
          };
        }
        if (action === "update") {
          if (!fieldId) return { success: false, error: "field_id is required for update action" };
          if (!data) return { success: false, error: "field_data is required for update action" };
          const result = await client.update("fields", fieldId, compact({ ...data }));
          return { success: true, action: "update", field_id: fieldId, result };
        }
        if (action === "delete") {
          if (!fieldId) return { success: false, error: "field_id is required for delete action" };
          await client.delete("fields", fieldId);
          return { success: true, action: "delete", field_id: fieldId, message: "Field deleted successfully" };
        }
        if (action === "associate") {
          if (!fieldId || !fieldsetId) {
            return { success: false, error: "field_id and fieldset_id are required for associate action" };
          }
          // fieldset_id goes in the body, not the path. `required` is compared
          // against the literal string "on" server-side, so a bool won't stick.
          const payload: Row = {
            fieldset_id: fieldsetId,
            required: args.required ? "on" : "",
          };
          if (args.order !== undefined && args.order !== null) payload.order = args.order;
          await client.request("POST", `fields/${fieldId}/associate`, { json: payload });
          return {
            success: true,
            action: "associate",
            field_id: fieldId,
            fieldset_id: fieldsetId,
            message: "Field associated with fieldset successfully",
          };
        }
        // disassociate
        if (!fieldId || !fieldsetId) {
          return { success: false, error: "field_id and fieldset_id are required for disassociate action" };
        }
        await client.request("POST", `fields/${fieldId}/disassociate`, {
          json: { fieldset_id: fieldsetId },
        });
        return {
          success: true,
          action: "disassociate",
          field_id: fieldId,
          fieldset_id: fieldsetId,
          message: "Field disassociated from fieldset successfully",
        };
      }),
    },

    {
      name: "manage_fieldsets",
      description:
        "Manage Snipe-IT fieldsets (collections of custom fields assigned to models).\n" +
        "- create/get/list/update/delete\n" +
        "- fields: list all fields in a fieldset\n" +
        "- reorder: reorder fields (requires field_order list of field IDs)\n" +
        "Requires name to create.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete", "fields", "reorder"]).describe(
          "The action to perform on fieldsets",
        ),
        fieldset_id: z.number().int().optional().describe(
          "Fieldset ID (required for get, update, delete, fields, reorder)",
        ),
        fieldset_data: fieldsetDataSchema.optional().describe(
          "Fieldset data (required for create, optional for update)",
        ),
        limit: z.number().int().default(50).describe("Number of results to return (list)"),
        offset: z.number().int().default(0).describe("Number of results to skip (list)"),
        field_order: z.array(z.number().int()).optional().describe(
          "Ordered list of field IDs (for reorder action)",
        ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_fieldsets", async (args) => {
        const action = args.action as string;
        const id = args.fieldset_id as number | undefined;
        const data = args.fieldset_data as FieldsetData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "fieldset_data is required for create action" };
          if (!data.name) return { success: false, error: "name is required to create a fieldset" };
          return { success: true, action: "create", fieldset: await client.create("fieldsets", compact({ ...data })) };
        }
        if (action === "get") {
          if (!id) return { success: false, error: "fieldset_id is required for get action" };
          return { success: true, action: "get", fieldset: await client.get("fieldsets", id) };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("fieldsets", {
            limit: args.limit as number,
            offset: args.offset as number,
          });
          const fieldsets = rows.map((fs) => pick(fs, ["id", "name", "fields_count", "models_count"]));
          return {
            success: true,
            action: "list",
            ...paginationMeta(fieldsets.length, total, args.limit as number, args.offset as number),
            fieldsets,
          };
        }
        if (action === "update") {
          if (!id) return { success: false, error: "fieldset_id is required for update action" };
          if (!data) return { success: false, error: "fieldset_data is required for update action" };
          const result = await client.update("fieldsets", id, compact({ ...data }));
          return { success: true, action: "update", fieldset_id: id, result };
        }
        if (action === "delete") {
          if (!id) return { success: false, error: "fieldset_id is required for delete action" };
          await client.delete("fieldsets", id);
          return { success: true, action: "delete", fieldset_id: id, message: "Fieldset deleted successfully" };
        }
        if (action === "fields") {
          if (!id) return { success: false, error: "fieldset_id is required for fields action" };
          // fieldsets/{id}/fields is POST-only; the show endpoint already
          // embeds the fieldset's fields.
          const result = await client.request("GET", `fieldsets/${id}`);
          const embedded = (result.fields ?? {}) as Record<string, unknown>;
          const fields = (embedded.rows as Row[]) ?? [];
          return { success: true, action: "fields", fieldset_id: id, fields };
        }
        // reorder
        if (!id) return { success: false, error: "fieldset_id is required for reorder action" };
        const fieldOrder = args.field_order as number[] | undefined;
        if (!fieldOrder) return { success: false, error: "field_order is required for reorder action" };
        const result = await client.request("POST", `fields/fieldsets/${id}/order`, {
          json: { item: fieldOrder },
        });
        return {
          success: true,
          action: "reorder",
          fieldset_id: id,
          message: "Field order updated successfully",
          result,
        };
      }),
    },
  ];
}

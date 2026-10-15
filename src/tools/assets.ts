/**
 * Snipe-IT asset tools (/hardware) - TypeScript port of `tools/assets.py`.
 *
 * Seven tools: manage_assets (CRUD), asset_operations (checkout/checkin/audit/
 * restore), asset_files, asset_labels, asset_maintenance, asset_licenses,
 * asset_requests.
 *
 * Endpoints for the operations the Python code delegated to snipeit-python-api
 * were taken verbatim from that library's source (resources/assets/*), so the
 * HTTP surface matches: e.g. checkout uses assigned_user/assigned_asset/
 * assigned_location, delete_file hits `.../files/{id}/delete`, and labels POSTs
 * `{asset_tags}` to `hardware/labels` expecting a PDF.
 *
 * Two of those inherited endpoints were simply wrong and have been corrected
 * against Snipe-IT v8.7.2: maintenance records POST to the flat `maintenances`
 * resource (not `hardware/{id}/maintenances`), and checkout requests live under
 * the `account` prefix (not `hardware/{id}/request`).
 *
 * State-changing operations (checkout/checkin/audit/restore/maintenance) return
 * the raw Snipe-IT API result rather than reconstructing the library's Asset
 * object, so their `result`/`maintenance` payloads differ in shape from the
 * Python server while carrying the same information.
 */

import { z } from "zod";
import {
  HARDWARE_STANDARD_FIELDS,
  paginationMeta,
  type SnipeITClient,
} from "../client.ts";
import { guarded, type ToolDef } from "../tool.ts";
import {
  type AssetData,
  assetDataSchema,
  type AuditData,
  auditDataSchema,
  type CheckinData,
  checkinDataSchema,
  type CheckoutData,
  checkoutDataSchema,
  type MaintenanceData,
  maintenanceDataSchema,
  type AssetRequestData,
  assetRequestDataSchema,
} from "../schemas.ts";
import { pick, type Row } from "../util.ts";

/** Drop keys whose value is undefined or null (Python's model_dump + None filter). */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null),
  );
}

function basename(path: string): string {
  return path.replace(/^.*[\\/]/, "");
}

export function assetsTools(client: SnipeITClient): ToolDef[] {
  return [
    {
      name: "manage_assets",
      description:
        "Manage Snipe-IT assets with CRUD operations.\n" +
        "- create: requires asset_data with at least status_id and model_id\n" +
        "- get: by asset_id, asset_tag, or serial (dedicated bytag/byserial endpoints)\n" +
        "- list: pagination + filtering by status/model/company/location/category/manufacturer/assigned_to\n" +
        "- update: requires asset_id and asset_data/extra_fields\n" +
        "- delete: requires asset_id\n" +
        "Use extra_fields for fields not in asset_data (asset_eol_date, custom fields " +
        "_snipeit_*); they are validated against the model's fieldset before sending.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete"]).describe(
          "The action to perform on assets",
        ),
        asset_id: z.number().int().optional().describe(
          "Asset ID (required for get, update, delete)",
        ),
        asset_tag: z.string().optional().describe(
          "Asset tag (alternative to asset_id for get)",
        ),
        serial: z.string().optional().describe(
          "Serial number (alternative to asset_id for get)",
        ),
        asset_data: assetDataSchema.optional().describe(
          "Asset data for standard fields (required for create, optional for update)",
        ),
        extra_fields: z.record(z.string(), z.unknown()).optional().describe(
          "Additional fields not in asset_data: asset_eol_date, custom fields " +
            "(_snipeit_*), etc. Validated against the model's fieldset.",
        ),
        limit: z.number().int().default(20).describe(
          "Results per page (list). Default 20 - asset payloads are large.",
        ),
        offset: z.number().int().default(0).describe("Results to skip (list)"),
        search: z.string().optional().describe("Search query (list)"),
        sort: z.string().optional().describe(
          "Field to sort by (list): id, name, asset_tag, serial, model, " +
            "model_number, last_checkout, category, manufacturer, notes, " +
            "expected_checkin, order_number, companyName, location, image, " +
            "status_label, assigned_to, created_at, purchase_date, purchase_cost",
        ),
        order: z.enum(["asc", "desc"]).optional().describe("Sort order (list)"),
        status_id: z.number().int().optional().describe("Filter by status label ID (list)"),
        model_id: z.number().int().optional().describe("Filter by model ID (list)"),
        company_id: z.number().int().optional().describe("Filter by company ID (list)"),
        location_id: z.number().int().optional().describe("Filter by location ID (list)"),
        category_id: z.number().int().optional().describe("Filter by category ID (list)"),
        manufacturer_id: z.number().int().optional().describe("Filter by manufacturer ID (list)"),
        assigned_to: z.number().int().optional().describe(
          "Filter by assigned user/asset/location ID (list)",
        ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_assets", async (args) => {
        const action = args.action as string;
        const assetId = args.asset_id as number | undefined;
        const assetData = args.asset_data as AssetData | undefined;
        const extraFields = args.extra_fields as Record<string, unknown> | undefined;

        if (action === "create") {
          if (!assetData) {
            return { success: false, error: "asset_data is required for create action" };
          }
          if (!assetData.status_id || !assetData.model_id) {
            return {
              success: false,
              error: "status_id and model_id are required to create an asset",
            };
          }
          const payload = compact({ ...assetData });

          if (extraFields) {
            const validCustom = new Set<string>();
            const modelInfo = await client.request("GET", `models/${assetData.model_id}`);
            const fieldset = (modelInfo.fieldset ?? {}) as Record<string, unknown>;
            const fieldsetId = fieldset && typeof fieldset === "object"
              ? fieldset.id as number | undefined
              : undefined;
            if (fieldsetId) {
              const fsDetail = await client.request("GET", `fieldsets/${fieldsetId}`);
              const fieldsData = (fsDetail.fields ?? {}) as Record<string, unknown>;
              for (const f of (fieldsData.rows as Record<string, unknown>[]) ?? []) {
                const dbCol = f?.db_column_name as string | undefined;
                if (dbCol) validCustom.add(dbCol);
              }
            }
            const invalid = validateExtraFields(extraFields, validCustom);
            if (invalid) return invalid;
            Object.assign(payload, extraFields);
          }

          const asset = await client.request("POST", "hardware", { json: payload });
          return { success: true, action: "create", asset };
        }

        if (action === "get") {
          const assetTag = args.asset_tag as string | undefined;
          const serial = args.serial as string | undefined;
          if (assetTag) {
            const asset = await client.request("GET", `hardware/bytag/${assetTag}`);
            return { success: true, action: "get", asset };
          }
          if (serial) {
            const res = await client.request("GET", `hardware/byserial/${serial}`);
            if ("rows" in res) {
              const assets = (res.rows as Record<string, unknown>[]) ?? [];
              if (assets.length === 0) {
                return { success: false, error: `No asset found with serial: ${serial}` };
              }
              return {
                success: true,
                action: "get",
                asset: assets.length === 1 ? assets[0] : null,
                assets: assets.length > 1 ? assets : null,
                count: assets.length,
              };
            }
            return { success: true, action: "get", asset: res };
          }
          if (assetId) {
            const asset = await client.request("GET", `hardware/${assetId}`);
            return { success: true, action: "get", asset };
          }
          return {
            success: false,
            error: "One of asset_id, asset_tag, or serial is required for get action",
          };
        }

        if (action === "list") {
          const [rows, total] = await client.listPage("hardware", {
            limit: args.limit as number,
            offset: args.offset as number,
            search: args.search as string | undefined,
            sort: args.sort as string | undefined,
            order: args.order as string | undefined,
            extra: {
              status_id: args.status_id,
              model_id: args.model_id,
              company_id: args.company_id,
              location_id: args.location_id,
              category_id: args.category_id,
              manufacturer_id: args.manufacturer_id,
              assigned_to: args.assigned_to,
            },
          });
          return {
            success: true,
            action: "list",
            ...paginationMeta(rows.length, total, args.limit as number, args.offset as number),
            assets: rows,
          };
        }

        if (action === "update") {
          if (!assetId) {
            return { success: false, error: "asset_id is required for update action" };
          }
          if (!assetData && !extraFields) {
            return {
              success: false,
              error: "asset_data or extra_fields is required for update action",
            };
          }
          const payload: Record<string, unknown> = assetData ? compact({ ...assetData }) : {};

          if (extraFields) {
            const current = await client.request("GET", `hardware/${assetId}`);
            const validCustom = new Set<string>();
            const cfs = current.custom_fields;
            if (cfs && typeof cfs === "object") {
              for (const info of Object.values(cfs as Record<string, unknown>)) {
                if (info && typeof info === "object" && "field" in info) {
                  const dbCol = (info as Record<string, unknown>).field as string | undefined;
                  if (dbCol) validCustom.add(dbCol);
                }
              }
            }
            const invalid = validateExtraFields(extraFields, validCustom);
            if (invalid) return invalid;
            Object.assign(payload, extraFields);
          }

          if (Object.keys(payload).length === 0) {
            return { success: false, error: "No fields to update (all values are None)" };
          }
          const asset = await client.request("PATCH", `hardware/${assetId}`, { json: payload });
          return { success: true, action: "update", asset };
        }

        // delete
        if (!assetId) {
          return { success: false, error: "asset_id is required for delete action" };
        }
        await client.delete("hardware", assetId);
        return {
          success: true,
          action: "delete",
          asset_id: assetId,
          message: "Asset deleted successfully",
        };
      }),
    },

    {
      name: "asset_operations",
      description:
        "Perform state operations on assets.\n" +
        "- checkout: check out to a user, location, or another asset\n" +
        "- checkin: check back into inventory\n" +
        "- audit: mark as audited\n" +
        "- restore: restore a soft-deleted asset",
      inputSchema: {
        action: z.enum(["checkout", "checkin", "audit", "restore"]).describe(
          "The operation to perform on the asset",
        ),
        asset_id: z.number().int().describe("Asset ID"),
        checkout_data: checkoutDataSchema.optional().describe(
          "Checkout details (required for checkout action)",
        ),
        checkin_data: checkinDataSchema.optional().describe(
          "Checkin details (optional for checkin action)",
        ),
        audit_data: auditDataSchema.optional().describe(
          "Audit details (optional for audit action)",
        ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      handler: guarded("asset_operations", async (args) => {
        const action = args.action as string;
        const assetId = args.asset_id as number;

        if (action === "checkout") {
          const co = args.checkout_data as CheckoutData | undefined;
          if (!co) {
            return { success: false, error: "checkout_data is required for checkout action" };
          }
          const body: Record<string, unknown> = { checkout_to_type: co.checkout_to_type };
          if (co.checkout_to_type === "user") body.assigned_user = co.assigned_to_id;
          else if (co.checkout_to_type === "asset") body.assigned_asset = co.assigned_to_id;
          else body.assigned_location = co.assigned_to_id;
          Object.assign(
            body,
            compact({
              expected_checkin: co.expected_checkin,
              checkout_at: co.checkout_at,
              note: co.note,
              name: co.name,
            }),
          );
          const result = await client.request("POST", `hardware/${assetId}/checkout`, { json: body });
          return {
            success: true,
            action: "checkout",
            asset_id: assetId,
            message: `Asset checked out to ${co.checkout_to_type} ${co.assigned_to_id}`,
            result,
          };
        }

        if (action === "checkin") {
          const ci = args.checkin_data as CheckinData | undefined;
          const body = compact({ note: ci?.note, location_id: ci?.location_id });
          const result = await client.request("POST", `hardware/${assetId}/checkin`, { json: body });
          return {
            success: true,
            action: "checkin",
            asset_id: assetId,
            message: "Asset checked in successfully",
            result,
          };
        }

        if (action === "audit") {
          const ad = args.audit_data as AuditData | undefined;
          const body = compact({
            location_id: ad?.location_id,
            note: ad?.note,
            next_audit_date: ad?.next_audit_date,
          });
          const result = await client.request("POST", `hardware/${assetId}/audit`, { json: body });
          return {
            success: true,
            action: "audit",
            asset_id: assetId,
            message: "Asset audited successfully",
            result,
          };
        }

        // restore
        const result = await client.request("POST", `hardware/${assetId}/restore`, { json: {} });
        return {
          success: true,
          action: "restore",
          asset_id: assetId,
          message: "Asset restored successfully",
          result,
        };
      }),
    },

    {
      name: "asset_files",
      description:
        "Manage file attachments for assets.\n" +
        "- upload: upload one or more files to an asset\n" +
        "- list: list all files attached to an asset\n" +
        "- download: download a specific file to save_path\n" +
        "- delete: delete a specific file from an asset",
      inputSchema: {
        action: z.enum(["upload", "list", "download", "delete"]).describe(
          "The file operation to perform",
        ),
        asset_id: z.number().int().describe("Asset ID"),
        file_paths: z.array(z.string()).optional().describe(
          "List of file paths to upload (for upload action)",
        ),
        notes: z.string().optional().describe("Notes for uploaded files (for upload action)"),
        file_id: z.number().int().optional().describe(
          "File ID (required for download and delete actions)",
        ),
        save_path: z.string().optional().describe("Path to save downloaded file (download)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("asset_files", async (args) => {
        const action = args.action as string;
        const assetId = args.asset_id as number;

        if (action === "list") {
          const files = await client.request("GET", `hardware/${assetId}/files`);
          return { success: true, action: "list", asset_id: assetId, files };
        }

        if (action === "upload") {
          const filePaths = args.file_paths as string[] | undefined;
          if (!filePaths || filePaths.length === 0) {
            return { success: false, error: "file_paths is required for upload action" };
          }
          const form = new FormData();
          for (const p of filePaths) {
            let bytes: Uint8Array;
            try {
              bytes = await Deno.readFile(p);
            } catch {
              return { success: false, error: `File not found or unreadable: ${p}` };
            }
            form.append("file[]", new Blob([bytes as BlobPart]), basename(p));
          }
          const notes = args.notes as string | undefined;
          if (notes !== undefined) form.append("notes", notes);

          const res = await fetch(`${client.baseUrl}/api/v1/hardware/${assetId}/files`, {
            method: "POST",
            headers: { Authorization: client.authHeader, Accept: "application/json" },
            body: form,
          });
          if (!res.ok) {
            return { success: false, error: `Upload failed: HTTP ${res.status}` };
          }
          const result = await res.json();
          return {
            success: true,
            action: "upload",
            asset_id: assetId,
            message: `Uploaded ${filePaths.length} file(s) successfully`,
            result,
          };
        }

        if (action === "download") {
          const fileId = args.file_id as number | undefined;
          const savePath = args.save_path as string | undefined;
          if (fileId === undefined) {
            return { success: false, error: "file_id is required for download action" };
          }
          if (!savePath) {
            return { success: false, error: "save_path is required for download action" };
          }
          const res = await fetch(
            `${client.baseUrl}/api/v1/hardware/${assetId}/files/${fileId}`,
            { headers: { Authorization: client.authHeader } },
          );
          if (!res.ok) {
            return { success: false, error: `Download failed: HTTP ${res.status}` };
          }
          await ensureDir(savePath);
          await Deno.writeFile(savePath, new Uint8Array(await res.arrayBuffer()));
          return {
            success: true,
            action: "download",
            asset_id: assetId,
            file_id: fileId,
            saved_to: savePath,
            message: `File downloaded to ${savePath}`,
          };
        }

        // delete - note the library's `/delete` suffix on the route
        const fileId = args.file_id as number | undefined;
        if (fileId === undefined) {
          return { success: false, error: "file_id is required for delete action" };
        }
        await client.request("DELETE", `hardware/${assetId}/files/${fileId}/delete`);
        return {
          success: true,
          action: "delete",
          asset_id: assetId,
          file_id: fileId,
          message: "File deleted successfully",
        };
      }),
    },

    {
      name: "asset_labels",
      description:
        "Generate printable PDF labels for assets. Provide either asset_ids or " +
        "asset_tags; the labels are saved as a PDF to save_path.",
      inputSchema: {
        asset_ids: z.array(z.number().int()).optional().describe(
          "List of asset IDs to generate labels for",
        ),
        asset_tags: z.array(z.string()).optional().describe(
          "List of asset tags to generate labels for",
        ),
        save_path: z.string().default("/tmp/asset_labels.pdf").describe(
          "Path where the PDF labels file should be saved",
        ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      handler: guarded("asset_labels", async (args) => {
        const assetIds = args.asset_ids as number[] | undefined;
        let tags = args.asset_tags as string[] | undefined;
        const savePath = (args.save_path as string) ?? "/tmp/asset_labels.pdf";

        if ((!assetIds || assetIds.length === 0) && (!tags || tags.length === 0)) {
          return { success: false, error: "Either asset_ids or asset_tags must be provided" };
        }

        // Resolve asset_ids to their asset_tags - hardware/labels takes tags.
        if (assetIds && assetIds.length > 0) {
          tags = [];
          for (const id of assetIds) {
            const asset = await client.request("GET", `hardware/${id}`);
            const tag = asset.asset_tag as string | undefined;
            if (tag) tags.push(tag);
          }
        }
        if (!tags || tags.length === 0) {
          return { success: false, error: "No valid asset tags found" };
        }

        const res = await fetch(`${client.baseUrl}/api/v1/hardware/labels`, {
          method: "POST",
          headers: {
            Authorization: client.authHeader,
            "Content-Type": "application/json",
            Accept: "application/pdf",
          },
          body: JSON.stringify({ asset_tags: tags }),
        });
        if (!res.ok) {
          return { success: false, error: `Label generation failed: HTTP ${res.status}` };
        }
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/pdf")) {
          return {
            success: false,
            error: `Expected PDF from hardware/labels; got Content-Type: ${contentType || "unknown"}`,
          };
        }
        await ensureDir(savePath);
        await Deno.writeFile(savePath, new Uint8Array(await res.arrayBuffer()));
        return {
          success: true,
          action: "generate_labels",
          saved_to: savePath,
          message: `Labels generated and saved to ${savePath}`,
        };
      }),
    },

    {
      name: "asset_maintenance",
      description:
        "Manage maintenance records for assets.\n" +
        "- create: create a new maintenance record for an asset\n" +
        "- list_types: list the maintenance types (needed for maintenance_type_id)",
      inputSchema: {
        action: z.enum(["create", "list_types"]).describe(
          "The maintenance operation to perform",
        ),
        asset_id: z.number().int().optional().describe("Asset ID (required for create)"),
        maintenance_data: maintenanceDataSchema.optional().describe(
          "Maintenance record data (required for create action)",
        ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      handler: guarded("asset_maintenance", async (args) => {
        const action = args.action as string;

        if (action === "list_types") {
          const result = await client.request("GET", "maintenance-types");
          const types = ((result.rows as Row[]) ?? []).map((t) => pick(t, ["id", "name"]));
          return { success: true, action: "list_types", count: types.length, types };
        }

        const assetId = args.asset_id as number | undefined;
        if (!assetId) return { success: false, error: "asset_id is required for create action" };
        const md = args.maintenance_data as MaintenanceData | undefined;
        if (!md) return { success: false, error: "maintenance_data is required for create action" };

        // v8.7 dropped POST hardware/{id}/maintenances; the asset is now
        // identified by asset_id in the body of the flat maintenances resource
        // (a mutator forwards it to the polymorphic item_id/item_type pair).
        const body = compact({
          asset_id: assetId,
          name: md.name,
          maintenance_type_id: md.maintenance_type_id,
          supplier_id: md.supplier_id,
          is_warranty: md.is_warranty,
          cost: md.cost,
          start_date: md.start_date,
          completion_date: md.completion_date,
          url: md.url,
          notes: md.notes,
        });
        const res = await client.request("POST", "maintenances", { json: body });
        const maintenance = (res.payload ?? res) as unknown;
        return {
          success: true,
          action: "create",
          asset_id: assetId,
          message: "Maintenance record created successfully",
          maintenance,
        };
      }),
    },

    {
      name: "asset_licenses",
      description: "Get all licenses checked out to an asset.",
      inputSchema: {
        asset_id: z.number().int().describe("Asset ID"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      handler: guarded("asset_licenses", async (args) => {
        const assetId = args.asset_id as number;
        const licenses = await client.request("GET", `hardware/${assetId}/licenses`);
        return { success: true, asset_id: assetId, licenses };
      }),
    },

    {
      name: "asset_requests",
      description:
        "Manage asset checkout requests (requestable assets only).\n" +
        "- request: submit a request to checkout an asset\n" +
        "- cancel: cancel a pending request\n" +
        "Note: approving/denying requests is web-UI only (no API).",
      inputSchema: {
        action: z.enum(["request", "cancel"]).describe("The request action to perform"),
        asset_id: z.number().int().describe("Asset ID (must be a requestable asset)"),
        request_data: assetRequestDataSchema.optional().describe(
          "Request details (for request action)",
        ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      handler: guarded("asset_requests", async (args) => {
        const action = args.action as string;
        const assetId = args.asset_id as number;

        if (action === "request") {
          const rd = args.request_data as AssetRequestData | undefined;
          const payload = compact({
            expected_checkout: rd?.expected_checkout,
            note: rd?.note,
          });
          // Checkout requests live under the `account` prefix, not `hardware`.
          const result = await client.request(
            "POST",
            `account/request/${assetId}`,
            Object.keys(payload).length ? { json: payload } : {},
          );
          return {
            success: true,
            action: "request",
            asset_id: assetId,
            message: "Checkout request submitted",
            result,
          };
        }

        const result = await client.request("POST", `account/request/${assetId}/cancel`);
        return {
          success: true,
          action: "cancel",
          asset_id: assetId,
          message: "Checkout request cancelled",
          result,
        };
      }),
    },
  ];
}

/**
 * Validate extra_fields against the standard hardware fields plus the model's
 * custom-field db columns. Returns an error result object when any field is
 * unknown, or `null` when all fields are valid.
 */
function validateExtraFields(
  extraFields: Record<string, unknown>,
  validCustom: Set<string>,
): { success: false; error: string } | null {
  const allValid = new Set([...HARDWARE_STANDARD_FIELDS, ...validCustom]);
  const invalid = Object.keys(extraFields).filter((k) => !allValid.has(k)).sort();
  if (invalid.length === 0) return null;
  return {
    success: false,
    error: `Unknown fields: ${JSON.stringify(invalid)}. ` +
      `Available standard fields: ${JSON.stringify([...HARDWARE_STANDARD_FIELDS].sort())}. ` +
      `Available custom fields: ${JSON.stringify([...validCustom].sort())}`,
  };
}

async function ensureDir(filePath: string): Promise<void> {
  const dir = filePath.replace(/[\\/][^\\/]*$/, "");
  if (dir && dir !== filePath) {
    await Deno.mkdir(dir, { recursive: true }).catch(() => {});
  }
}

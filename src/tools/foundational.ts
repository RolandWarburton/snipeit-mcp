/**
 * Snipe-IT foundational entity tools - TypeScript port of `tools/foundational.py`.
 *
 * Eight tools: manage_categories, manage_manufacturers, manage_models,
 * manage_status_labels, manage_locations, manage_suppliers,
 * manage_depreciations, model_files.
 *
 * The Python code split these between the snipeit-python-api library (categories,
 * manufacturers, models, locations) and the direct API (status labels, suppliers,
 * depreciations, all list/relationship/file endpoints). The library CRUD maps to
 * standard REST endpoints (`POST/GET/PATCH/DELETE {path}/{id}`, create/update
 * reading `payload`), so the whole module runs through the one fetch client here.
 * Response shapes are trimmed to the same fields the Python tools returned.
 */

import { z } from "zod";
import { paginationMeta, type SnipeITClient } from "../client.ts";
import { guarded, type ToolDef } from "../tool.ts";
import { basename, compact, ensureDir, listArgs, listParams, payloadOf, pick, type Row } from "../util.ts";
import {
  type CategoryData,
  categoryDataSchema,
  type ManufacturerData,
  manufacturerDataSchema,
  type AssetModelData,
  assetModelDataSchema,
  type StatusLabelData,
  statusLabelDataSchema,
  type LocationData,
  locationDataSchema,
  type SupplierData,
  supplierDataSchema,
  type DepreciationData,
  depreciationDataSchema,
} from "../schemas.ts";

export function foundationalTools(client: SnipeITClient): ToolDef[] {
  return [
    {
      name: "manage_categories",
      description:
        "Manage Snipe-IT categories (organize assets, accessories, consumables, " +
        "components, licenses) with CRUD: create/get/list/update/delete.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete"]).describe(
          "The action to perform on categories",
        ),
        category_id: z.number().int().optional().describe(
          "Category ID (required for get, update, delete)",
        ),
        category_data: categoryDataSchema.optional().describe(
          "Category data (required for create, optional for update)",
        ),
        ...listParams,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_categories", async (args) => {
        const action = args.action as string;
        const id = args.category_id as number | undefined;
        const data = args.category_data as CategoryData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "category_data is required for create action" };
          if (!data.name || !data.category_type) {
            return { success: false, error: "name and category_type are required to create a category" };
          }
          const p = payloadOf(await client.create("categories", compact({ ...data })));
          return {
            success: true,
            action: "create",
            category: { id: p.id, name: p.name ?? null, category_type: p.category_type ?? null },
          };
        }
        if (action === "get") {
          if (!id) return { success: false, error: "category_id is required for get action" };
          const c = await client.get("categories", id);
          return {
            success: true,
            action: "get",
            category: pick(c, [
              "id", "name", "category_type", "eula_text", "use_default_eula",
              "require_acceptance", "checkin_email", "assets_count", "accessories_count",
              "consumables_count", "components_count", "licenses_count",
            ]),
          };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("categories", listArgs(args));
          const categories = rows.map((c) => pick(c, ["id", "name", "category_type", "assets_count"]));
          return {
            success: true,
            action: "list",
            ...paginationMeta(categories.length, total, args.limit as number, args.offset as number),
            categories,
          };
        }
        if (action === "update") {
          if (!id) return { success: false, error: "category_id is required for update action" };
          if (!data) return { success: false, error: "category_data is required for update action" };
          const p = payloadOf(await client.update("categories", id, compact({ ...data })));
          return { success: true, action: "update", category: { id: p.id, name: p.name ?? null } };
        }
        // delete
        if (!id) return { success: false, error: "category_id is required for delete action" };
        await client.delete("categories", id);
        return { success: true, action: "delete", category_id: id, message: "Category deleted successfully" };
      }),
    },

    {
      name: "manage_manufacturers",
      description: "Manage Snipe-IT manufacturers (asset producers) with CRUD: create/get/list/update/delete.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete"]).describe(
          "The action to perform on manufacturers",
        ),
        manufacturer_id: z.number().int().optional().describe(
          "Manufacturer ID (required for get, update, delete)",
        ),
        manufacturer_data: manufacturerDataSchema.optional().describe(
          "Manufacturer data (required for create, optional for update)",
        ),
        ...listParams,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_manufacturers", async (args) => {
        const action = args.action as string;
        const id = args.manufacturer_id as number | undefined;
        const data = args.manufacturer_data as ManufacturerData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "manufacturer_data is required for create action" };
          if (!data.name) return { success: false, error: "name is required to create a manufacturer" };
          const p = payloadOf(await client.create("manufacturers", compact({ ...data })));
          return { success: true, action: "create", manufacturer: { id: p.id, name: p.name ?? null } };
        }
        if (action === "get") {
          if (!id) return { success: false, error: "manufacturer_id is required for get action" };
          const m = await client.get("manufacturers", id);
          return {
            success: true,
            action: "get",
            manufacturer: pick(m, [
              "id", "name", "url", "support_url", "support_phone", "support_email",
              "assets_count", "licenses_count", "consumables_count", "accessories_count",
            ]),
          };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("manufacturers", listArgs(args));
          const manufacturers = rows.map((m) => pick(m, ["id", "name", "assets_count"]));
          return {
            success: true,
            action: "list",
            ...paginationMeta(manufacturers.length, total, args.limit as number, args.offset as number),
            manufacturers,
          };
        }
        if (action === "update") {
          if (!id) return { success: false, error: "manufacturer_id is required for update action" };
          if (!data) return { success: false, error: "manufacturer_data is required for update action" };
          const p = payloadOf(await client.update("manufacturers", id, compact({ ...data })));
          return { success: true, action: "update", manufacturer: { id: p.id, name: p.name ?? null } };
        }
        if (!id) return { success: false, error: "manufacturer_id is required for delete action" };
        await client.delete("manufacturers", id);
        return { success: true, action: "delete", manufacturer_id: id, message: "Manufacturer deleted successfully" };
      }),
    },

    {
      name: "manage_models",
      description:
        "Manage Snipe-IT asset models (e.g. 'MacBook Pro 14\"') with CRUD plus " +
        "'assets' to list all assets of a model. Requires name and category_id to create.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete", "assets"]).describe(
          "The action to perform on asset models",
        ),
        model_id: z.number().int().optional().describe(
          "Model ID (required for get, update, delete, assets)",
        ),
        model_data: assetModelDataSchema.optional().describe(
          "Model data (required for create, optional for update)",
        ),
        ...listParams,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_models", async (args) => {
        const action = args.action as string;
        const id = args.model_id as number | undefined;
        const data = args.model_data as AssetModelData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "model_data is required for create action" };
          if (!data.name || !data.category_id) {
            return { success: false, error: "name and category_id are required to create a model" };
          }
          const p = payloadOf(await client.create("models", compact({ ...data })));
          return {
            success: true,
            action: "create",
            model: { id: p.id, name: p.name ?? null, model_number: p.model_number ?? null },
          };
        }
        if (action === "get") {
          if (!id) return { success: false, error: "model_id is required for get action" };
          const m = await client.get("models", id);
          return {
            success: true,
            action: "get",
            model: pick(m, [
              "id", "name", "model_number", "manufacturer", "category", "eol",
              "depreciation", "notes", "fieldset", "requestable", "assets_count",
            ]),
          };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("models", listArgs(args));
          const models = rows.map((m) => {
            const mfr = m.manufacturer;
            return {
              id: m.id ?? null,
              name: m.name ?? null,
              model_number: m.model_number ?? null,
              manufacturer: mfr && typeof mfr === "object" ? (mfr as Row).name ?? null : null,
              assets_count: m.assets_count ?? null,
            };
          });
          return {
            success: true,
            action: "list",
            ...paginationMeta(models.length, total, args.limit as number, args.offset as number),
            models,
          };
        }
        if (action === "update") {
          if (!id) return { success: false, error: "model_id is required for update action" };
          if (!data) return { success: false, error: "model_data is required for update action" };
          const p = payloadOf(await client.update("models", id, compact({ ...data })));
          return { success: true, action: "update", model: { id: p.id, name: p.name ?? null } };
        }
        if (action === "delete") {
          if (!id) return { success: false, error: "model_id is required for delete action" };
          await client.delete("models", id);
          return { success: true, action: "delete", model_id: id, message: "Model deleted successfully" };
        }
        // assets - there is no models/{id}/assets route (the controller method
        // exists but its route takes no id), so filter the hardware list instead.
        if (!id) return { success: false, error: "model_id is required for assets action" };
        const result = await client.request("GET", "hardware", {
          params: { model_id: id, limit: args.limit, offset: args.offset },
        });
        const assets = (result.rows as Row[]) ?? [];
        return {
          success: true,
          action: "assets",
          model_id: id,
          ...paginationMeta(assets.length, (result.total as number) ?? assets.length, args.limit as number, args.offset as number),
          assets,
        };
      }),
    },

    {
      name: "manage_status_labels",
      description:
        "Manage Snipe-IT status labels (deployable, pending, archived, undeployable) " +
        "with CRUD plus 'assets' to list all assets with a label. Requires name and type to create.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete", "assets"]).describe(
          "The action to perform on status labels",
        ),
        status_label_id: z.number().int().optional().describe(
          "Status label ID (required for get, update, delete, assets)",
        ),
        status_label_data: statusLabelDataSchema.optional().describe(
          "Status label data (required for create, optional for update)",
        ),
        ...listParams,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_status_labels", async (args) => {
        const action = args.action as string;
        const id = args.status_label_id as number | undefined;
        const data = args.status_label_data as StatusLabelData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "status_label_data is required for create action" };
          if (!data.name || !data.type) {
            return { success: false, error: "name and type are required to create a status label" };
          }
          const p = payloadOf(await client.create("statuslabels", compact({ ...data })));
          return {
            success: true,
            action: "create",
            status_label: { id: p.id, name: p.name ?? null, type: p.type ?? null },
          };
        }
        if (action === "get") {
          if (!id) return { success: false, error: "status_label_id is required for get action" };
          const sl = await client.get("statuslabels", id);
          return {
            success: true,
            action: "get",
            status_label: pick(sl, [
              "id", "name", "type", "color", "show_in_nav", "default_label", "notes", "assets_count",
            ]),
          };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("statuslabels", listArgs(args));
          const status_labels = rows.map((sl) => pick(sl, ["id", "name", "type", "assets_count"]));
          return {
            success: true,
            action: "list",
            ...paginationMeta(status_labels.length, total, args.limit as number, args.offset as number),
            status_labels,
          };
        }
        if (action === "update") {
          if (!id) return { success: false, error: "status_label_id is required for update action" };
          if (!data) return { success: false, error: "status_label_data is required for update action" };
          const p = payloadOf(await client.update("statuslabels", id, compact({ ...data })));
          return { success: true, action: "update", status_label: { id: p.id, name: p.name ?? null } };
        }
        if (action === "delete") {
          if (!id) return { success: false, error: "status_label_id is required for delete action" };
          await client.delete("statuslabels", id);
          return { success: true, action: "delete", status_label_id: id, message: "Status label deleted successfully" };
        }
        // assets - note the dedicated /assetlist endpoint
        if (!id) return { success: false, error: "status_label_id is required for assets action" };
        const result = await client.request("GET", `statuslabels/${id}/assetlist`, {
          params: { limit: args.limit, offset: args.offset },
        });
        const assets = (result.rows as Row[]) ?? [];
        return {
          success: true,
          action: "assets",
          status_label_id: id,
          ...paginationMeta(assets.length, (result.total as number) ?? assets.length, args.limit as number, args.offset as number),
          assets,
        };
      }),
    },

    {
      name: "manage_locations",
      description:
        "Manage Snipe-IT locations (physical places) with CRUD plus 'assets' and " +
        "'users' to list assets/users at a location. Requires name to create.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete", "assets", "users"]).describe(
          "The action to perform on locations",
        ),
        location_id: z.number().int().optional().describe(
          "Location ID (required for get, update, delete, assets, users)",
        ),
        location_data: locationDataSchema.optional().describe(
          "Location data (required for create, optional for update)",
        ),
        ...listParams,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_locations", async (args) => {
        const action = args.action as string;
        const id = args.location_id as number | undefined;
        const data = args.location_data as LocationData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "location_data is required for create action" };
          if (!data.name) return { success: false, error: "name is required to create a location" };
          const p = payloadOf(await client.create("locations", compact({ ...data })));
          return { success: true, action: "create", location: { id: p.id, name: p.name ?? null } };
        }
        if (action === "get") {
          if (!id) return { success: false, error: "location_id is required for get action" };
          const loc = await client.get("locations", id);
          return {
            success: true,
            action: "get",
            location: pick(loc, [
              "id", "name", "address", "address2", "city", "state", "country", "zip",
              "ldap_ou", "manager", "parent", "currency", "assets_count",
              "assigned_assets_count", "users_count",
            ]),
          };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("locations", listArgs(args));
          const locations = rows.map((loc) => pick(loc, ["id", "name", "city", "assets_count"]));
          return {
            success: true,
            action: "list",
            ...paginationMeta(locations.length, total, args.limit as number, args.offset as number),
            locations,
          };
        }
        if (action === "update") {
          if (!id) return { success: false, error: "location_id is required for update action" };
          if (!data) return { success: false, error: "location_data is required for update action" };
          const p = payloadOf(await client.update("locations", id, compact({ ...data })));
          return { success: true, action: "update", location: { id: p.id, name: p.name ?? null } };
        }
        if (action === "delete") {
          if (!id) return { success: false, error: "location_id is required for delete action" };
          await client.delete("locations", id);
          return { success: true, action: "delete", location_id: id, message: "Location deleted successfully" };
        }
        // assets / users
        if (!id) return { success: false, error: `location_id is required for ${action} action` };
        const rel = action === "assets" ? "assets" : "users";
        // v8.7 removed locations/{id}/users; users are now reached by filtering
        // the users list. Assets still have their own location sub-resource.
        const result = rel === "users"
          ? await client.request("GET", "users", {
            params: { location_id: id, limit: args.limit, offset: args.offset },
          })
          : await client.request("GET", `locations/${id}/assets`, {
            params: { limit: args.limit, offset: args.offset },
          });
        const rows = (result.rows as Row[]) ?? [];
        return {
          success: true,
          action,
          location_id: id,
          ...paginationMeta(rows.length, (result.total as number) ?? rows.length, args.limit as number, args.offset as number),
          [rel]: rows,
        };
      }),
    },

    {
      name: "manage_suppliers",
      description: "Manage Snipe-IT suppliers (vendors) with CRUD: create/get/list/update/delete. Requires name to create.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete"]).describe(
          "The action to perform on suppliers",
        ),
        supplier_id: z.number().int().optional().describe(
          "Supplier ID (required for get, update, delete)",
        ),
        supplier_data: supplierDataSchema.optional().describe(
          "Supplier data (required for create, optional for update)",
        ),
        ...listParams,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_suppliers", async (args) => {
        const action = args.action as string;
        const id = args.supplier_id as number | undefined;
        const data = args.supplier_data as SupplierData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "supplier_data is required for create action" };
          if (!data.name) return { success: false, error: "name is required to create a supplier" };
          const p = payloadOf(await client.create("suppliers", compact({ ...data })));
          return { success: true, action: "create", supplier: { id: p.id, name: p.name ?? null } };
        }
        if (action === "get") {
          if (!id) return { success: false, error: "supplier_id is required for get action" };
          const s = await client.get("suppliers", id);
          return {
            success: true,
            action: "get",
            supplier: pick(s, [
              "id", "name", "address", "address2", "city", "state", "country", "zip",
              "phone", "fax", "email", "contact", "url", "notes", "assets_count",
              "accessories_count", "licenses_count",
            ]),
          };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("suppliers", listArgs(args));
          const suppliers = rows.map((s) => pick(s, ["id", "name", "assets_count"]));
          return {
            success: true,
            action: "list",
            ...paginationMeta(suppliers.length, total, args.limit as number, args.offset as number),
            suppliers,
          };
        }
        if (action === "update") {
          if (!id) return { success: false, error: "supplier_id is required for update action" };
          if (!data) return { success: false, error: "supplier_data is required for update action" };
          const p = payloadOf(await client.update("suppliers", id, compact({ ...data })));
          return { success: true, action: "update", supplier: { id: p.id, name: p.name ?? null } };
        }
        if (!id) return { success: false, error: "supplier_id is required for delete action" };
        await client.delete("suppliers", id);
        return { success: true, action: "delete", supplier_id: id, message: "Supplier deleted successfully" };
      }),
    },

    {
      name: "manage_depreciations",
      description:
        "Manage Snipe-IT depreciations (how assets lose value over time) with CRUD. " +
        "Requires name and months to create.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete"]).describe(
          "The action to perform on depreciations",
        ),
        depreciation_id: z.number().int().optional().describe(
          "Depreciation ID (required for get, update, delete)",
        ),
        depreciation_data: depreciationDataSchema.optional().describe(
          "Depreciation data (required for create, optional for update)",
        ),
        ...listParams,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_depreciations", async (args) => {
        const action = args.action as string;
        const id = args.depreciation_id as number | undefined;
        const data = args.depreciation_data as DepreciationData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "depreciation_data is required for create action" };
          if (!data.name || data.months === undefined || data.months === null) {
            return { success: false, error: "name and months are required to create a depreciation" };
          }
          const p = payloadOf(await client.create("depreciations", compact({ ...data })));
          return {
            success: true,
            action: "create",
            depreciation: { id: p.id, name: p.name ?? null, months: p.months ?? null },
          };
        }
        if (action === "get") {
          if (!id) return { success: false, error: "depreciation_id is required for get action" };
          const d = await client.get("depreciations", id);
          return { success: true, action: "get", depreciation: pick(d, ["id", "name", "months"]) };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("depreciations", listArgs(args));
          const depreciations = rows.map((d) => pick(d, ["id", "name", "months"]));
          return {
            success: true,
            action: "list",
            ...paginationMeta(depreciations.length, total, args.limit as number, args.offset as number),
            depreciations,
          };
        }
        if (action === "update") {
          if (!id) return { success: false, error: "depreciation_id is required for update action" };
          if (!data) return { success: false, error: "depreciation_data is required for update action" };
          const p = payloadOf(await client.update("depreciations", id, compact({ ...data })));
          return { success: true, action: "update", depreciation: { id: p.id, name: p.name ?? null } };
        }
        if (!id) return { success: false, error: "depreciation_id is required for delete action" };
        await client.delete("depreciations", id);
        return { success: true, action: "delete", depreciation_id: id, message: "Depreciation deleted successfully" };
      }),
    },

    {
      name: "model_files",
      description:
        "Manage file attachments for asset models (docs, manuals, datasheets).\n" +
        "- upload: upload a file to a model\n" +
        "- list: list files attached to a model\n" +
        "- download: download a file to save_path\n" +
        "- delete: delete a file from a model",
      inputSchema: {
        action: z.enum(["upload", "list", "download", "delete"]).describe(
          "The file operation to perform",
        ),
        model_id: z.number().int().describe("Model ID"),
        file_path: z.string().optional().describe("File path to upload (for upload action)"),
        file_id: z.number().int().optional().describe(
          "File ID (required for download and delete actions)",
        ),
        save_path: z.string().optional().describe("Path to save downloaded file (download)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("model_files", async (args) => {
        const action = args.action as string;
        const modelId = args.model_id as number;

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
          // The generic files endpoint iterates $request->file('file'), so the
          // part must be an array even for a single upload.
          form.append("file[]", new Blob([bytes as BlobPart]), filename);
          const res = await fetch(`${client.baseUrl}/api/v1/models/${modelId}/files`, {
            method: "POST",
            headers: { Authorization: client.authHeader, Accept: "application/json" },
            body: form,
          });
          if (!res.ok) return { success: false, error: `Upload failed: HTTP ${res.status}` };
          const result = await res.json();
          return {
            success: true,
            action: "upload",
            model_id: modelId,
            message: `File '${filename}' uploaded successfully`,
            result,
          };
        }

        if (action === "list") {
          const result = await client.request("GET", `models/${modelId}/files`);
          const files = ((result.rows as Row[]) ?? []).map((f) =>
            pick(f, ["id", "filename", "url", "created_at", "notes"])
          );
          return { success: true, action: "list", model_id: modelId, count: files.length, files };
        }

        if (action === "download") {
          const fileId = args.file_id as number | undefined;
          const savePath = args.save_path as string | undefined;
          if (fileId === undefined) return { success: false, error: "file_id is required for download action" };
          if (!savePath) return { success: false, error: "save_path is required for download action" };
          const res = await fetch(
            `${client.baseUrl}/api/v1/models/${modelId}/files/${fileId}`,
            { headers: { Authorization: client.authHeader, Accept: "application/octet-stream" } },
          );
          if (!res.ok) return { success: false, error: `Download failed: HTTP ${res.status}` };
          await ensureDir(savePath);
          await Deno.writeFile(savePath, new Uint8Array(await res.arrayBuffer()));
          return {
            success: true,
            action: "download",
            model_id: modelId,
            file_id: fileId,
            saved_to: savePath,
            message: `File downloaded to ${savePath}`,
          };
        }

        // delete - model files route has no `/delete` suffix (unlike asset files)
        const fileId = args.file_id as number | undefined;
        if (fileId === undefined) return { success: false, error: "file_id is required for delete action" };
        await client.request("DELETE", `models/${modelId}/files/${fileId}/delete`);
        return {
          success: true,
          action: "delete",
          model_id: modelId,
          file_id: fileId,
          message: "File deleted successfully",
        };
      }),
    },
  ];
}

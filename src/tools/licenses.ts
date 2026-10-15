/**
 * Snipe-IT license tools - TypeScript port of `tools/licenses.py`.
 * Three tools: manage_licenses, license_seats, license_files.
 * All direct-API in Python. License file routes use `/upload` (POST) and
 * `/uploads` (list/download/delete), distinct from asset/model file routes.
 */

import { z } from "zod";
import { paginationMeta, type SnipeITClient } from "../client.ts";
import { guarded, type ToolDef } from "../tool.ts";
import { basename, compact, ensureDir, listArgs, listParams, payloadOf, pick, type Row } from "../util.ts";
import {
  type LicenseData,
  licenseDataSchema,
  type LicenseSeatCheckout,
  licenseSeatCheckoutSchema,
} from "../schemas.ts";

export function licensesTools(client: SnipeITClient): ToolDef[] {
  return [
    {
      name: "manage_licenses",
      description:
        "Manage Snipe-IT software licenses (seat-based) with CRUD: " +
        "create/get/list/update/delete. Requires name and seats to create.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete"]).describe(
          "The action to perform on licenses",
        ),
        license_id: z.number().int().optional().describe("License ID (required for get, update, delete)"),
        license_data: licenseDataSchema.optional().describe(
          "License data (required for create, optional for update)",
        ),
        ...listParams,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_licenses", async (args) => {
        const action = args.action as string;
        const id = args.license_id as number | undefined;
        const data = args.license_data as LicenseData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "license_data is required for create action" };
          if (!data.name || data.seats === undefined || data.seats === null) {
            return { success: false, error: "name and seats are required to create a license" };
          }
          const p = payloadOf(await client.create("licenses", compact({ ...data })));
          return { success: true, action: "create", license: { id: p.id ?? null, name: p.name ?? null, seats: p.seats ?? null } };
        }
        if (action === "get") {
          if (!id) return { success: false, error: "license_id is required for get action" };
          const l = await client.get("licenses", id);
          return {
            success: true,
            action: "get",
            license: pick(l, [
              "id", "name", "seats", "free_seats_count", "serial", "category", "company",
              "manufacturer", "supplier", "purchase_date", "purchase_cost", "expiration_date",
              "license_name", "license_email", "maintained", "reassignable", "notes",
            ]),
          };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("licenses", listArgs(args));
          const licenses = rows.map((l) => {
            const company = l.company;
            return {
              id: l.id ?? null,
              name: l.name ?? null,
              seats: l.seats ?? null,
              free_seats_count: l.free_seats_count ?? null,
              company: company && typeof company === "object" ? (company as Row).name ?? null : null,
            };
          });
          return {
            success: true,
            action: "list",
            ...paginationMeta(licenses.length, total, args.limit as number, args.offset as number),
            licenses,
          };
        }
        if (action === "update") {
          if (!id) return { success: false, error: "license_id is required for update action" };
          if (!data) return { success: false, error: "license_data is required for update action" };
          const p = payloadOf(await client.update("licenses", id, compact({ ...data })));
          return { success: true, action: "update", license: { id: p.id ?? null, name: p.name ?? null } };
        }
        if (!id) return { success: false, error: "license_id is required for delete action" };
        await client.delete("licenses", id);
        return { success: true, action: "delete", license_id: id, message: "License deleted successfully" };
      }),
    },

    {
      name: "license_seats",
      description:
        "Manage license seat checkouts.\n" +
        "- list: list all seats for a license (requires license_id)\n" +
        "- checkout: assign a seat to a user or asset (requires license_id, seat_id, checkout_data)\n" +
        "- checkin: release a seat (requires license_id, seat_id)",
      inputSchema: {
        action: z.enum(["list", "checkout", "checkin"]).describe(
          "The action to perform on license seats",
        ),
        license_id: z.number().int().optional().describe("License ID (required for all actions)"),
        seat_id: z.number().int().optional().describe("Seat ID (required for checkout and checkin)"),
        checkout_data: licenseSeatCheckoutSchema.optional().describe(
          "Checkout data (required for checkout action)",
        ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      handler: guarded("license_seats", async (args) => {
        const action = args.action as string;
        const licenseId = args.license_id as number | undefined;
        const seatId = args.seat_id as number | undefined;

        if (action === "list") {
          if (!licenseId) return { success: false, error: "license_id is required for list action" };
          const result = await client.request("GET", `licenses/${licenseId}/seats`);
          const seats = ((result.rows as Row[]) ?? []).map((s) =>
            pick(s, ["id", "name", "assigned_user", "assigned_asset", "location", "reassignable"])
          );
          return {
            success: true,
            action: "list",
            license_id: licenseId,
            count: seats.length,
            total: (result.total as number) ?? seats.length,
            seats,
          };
        }
        if (action === "checkout") {
          if (!licenseId) return { success: false, error: "license_id is required for checkout action" };
          if (!seatId) return { success: false, error: "seat_id is required for checkout action" };
          const co = args.checkout_data as LicenseSeatCheckout | undefined;
          if (!co) return { success: false, error: "checkout_data is required for checkout action" };
          if (!co.assigned_to && !co.asset_id) {
            return { success: false, error: "Either assigned_to (user ID) or asset_id is required for checkout" };
          }
          // Seats have no checkout/checkin endpoints - assignment is a PATCH on
          // the seat itself, and assigned_to/asset_id are mutually exclusive.
          const result = await client.request(
            "PATCH",
            `licenses/${licenseId}/seats/${seatId}`,
            { json: compact({ ...co }) },
          );
          return {
            success: true,
            action: "checkout",
            license_id: licenseId,
            seat_id: seatId,
            message: "License seat checked out successfully",
            result,
          };
        }
        // checkin - clearing assigned_to releases the seat. Sent literally
        // (not via compact, which strips nulls) because null IS the payload.
        if (!licenseId) return { success: false, error: "license_id is required for checkin action" };
        if (!seatId) return { success: false, error: "seat_id is required for checkin action" };
        const result = await client.request(
          "PATCH",
          `licenses/${licenseId}/seats/${seatId}`,
          { json: { assigned_to: null } },
        );
        return {
          success: true,
          action: "checkin",
          license_id: licenseId,
          seat_id: seatId,
          message: "License seat checked in successfully",
          result,
        };
      }),
    },

    {
      name: "license_files",
      description:
        "Manage file attachments for licenses.\n" +
        "- upload: upload a file to a license\n" +
        "- list: list files attached to a license\n" +
        "- download: download a file to save_path\n" +
        "- delete: delete a file from a license",
      inputSchema: {
        action: z.enum(["upload", "list", "download", "delete"]).describe(
          "The file operation to perform",
        ),
        license_id: z.number().int().describe("License ID"),
        file_path: z.string().optional().describe("File path to upload (for upload action)"),
        file_id: z.number().int().optional().describe(
          "File ID (required for download and delete actions)",
        ),
        save_path: z.string().optional().describe("Path to save downloaded file (download)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("license_files", async (args) => {
        const action = args.action as string;
        const licenseId = args.license_id as number;

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
          const res = await fetch(`${client.baseUrl}/api/v1/licenses/${licenseId}/files`, {
            method: "POST",
            headers: { Authorization: client.authHeader, Accept: "application/json" },
            body: form,
          });
          if (!res.ok) return { success: false, error: `Upload failed: HTTP ${res.status}` };
          const result = await res.json();
          return {
            success: true,
            action: "upload",
            license_id: licenseId,
            message: `File '${filename}' uploaded successfully`,
            result,
          };
        }

        if (action === "list") {
          const result = await client.request("GET", `licenses/${licenseId}/files`);
          const files = ((result.rows as Row[]) ?? []).map((f) =>
            pick(f, ["id", "filename", "url", "created_at", "notes"])
          );
          return { success: true, action: "list", license_id: licenseId, count: files.length, files };
        }

        if (action === "download") {
          const fileId = args.file_id as number | undefined;
          const savePath = args.save_path as string | undefined;
          if (fileId === undefined) return { success: false, error: "file_id is required for download action" };
          if (!savePath) return { success: false, error: "save_path is required for download action" };
          const res = await fetch(
            `${client.baseUrl}/api/v1/licenses/${licenseId}/files/${fileId}`,
            { headers: { Authorization: client.authHeader, Accept: "application/octet-stream" } },
          );
          if (!res.ok) return { success: false, error: `Download failed: HTTP ${res.status}` };
          await ensureDir(savePath);
          await Deno.writeFile(savePath, new Uint8Array(await res.arrayBuffer()));
          return {
            success: true,
            action: "download",
            license_id: licenseId,
            file_id: fileId,
            saved_to: savePath,
            message: `File downloaded to ${savePath}`,
          };
        }

        // delete
        const fileId = args.file_id as number | undefined;
        if (fileId === undefined) return { success: false, error: "file_id is required for delete action" };
        await client.request("DELETE", `licenses/${licenseId}/files/${fileId}/delete`);
        return {
          success: true,
          action: "delete",
          license_id: licenseId,
          file_id: fileId,
          message: "File deleted successfully",
        };
      }),
    },
  ];
}

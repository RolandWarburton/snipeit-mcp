/**
 * Snipe-IT people tools - TypeScript port of `tools/people.py`.
 * Five tools: manage_users (CRUD, restore, me), user_assets,
 * manage_companies, manage_departments, manage_groups.
 *
 * The `user_two_factor` tool was dropped for Snipe-IT v8.7: the
 * users/two_factor_reset endpoint no longer exists in the v1 API, and 2FA
 * state is now read-only there (two_factor_enrolled / two_factor_optin).
 *
 * All endpoints were direct-API in the Python code, so these port literally.
 */

import { z } from "zod";
import { paginationMeta, type SnipeITClient } from "../client.ts";
import { guarded, type ToolDef } from "../tool.ts";
import { compact, listArgs, listParams, pick, type Row } from "../util.ts";
import {
  type UserData,
  userDataSchema,
  type CompanyData,
  companyDataSchema,
  type DepartmentData,
  departmentDataSchema,
  type GroupData,
  groupDataSchema,
} from "../schemas.ts";

export function peopleTools(client: SnipeITClient): ToolDef[] {
  return [
    {
      name: "manage_users",
      description:
        "Manage Snipe-IT users with CRUD plus 'restore' (undelete) and 'me' " +
        "(current user). Requires username, password, first_name to create.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete", "restore", "me"]).describe(
          "The action to perform on users",
        ),
        user_id: z.number().int().optional().describe(
          "User ID (required for get, update, delete, restore)",
        ),
        user_data: userDataSchema.optional().describe(
          "User data (required for create, optional for update)",
        ),
        ...listParams,
        username: z.string().optional().describe("Username for exact match (list)"),
        email: z.string().optional().describe("Email for exact match (list)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_users", async (args) => {
        const action = args.action as string;
        const userId = args.user_id as number | undefined;
        const data = args.user_data as UserData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "user_data is required for create action" };
          if (!data.username || !data.password || !data.first_name) {
            return { success: false, error: "username, password, and first_name are required to create a user" };
          }
          const r = await client.create("users", compact({ ...data }));
          const p = (r.payload ?? {}) as Row;
          return {
            success: true,
            action: "create",
            user: {
              id: p.id ?? r.id ?? null,
              username: data.username,
              name: `${data.first_name} ${data.last_name ?? ""}`.trim(),
            },
          };
        }
        if (action === "get") {
          if (!userId) return { success: false, error: "user_id is required for get action" };
          return { success: true, action: "get", user: await client.get("users", userId) };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("users", {
            ...listArgs(args),
            extra: { username: args.username, email: args.email },
          });
          const users = rows.map((u) =>
            pick(u, ["id", "username", "name", "email", "department", "activated"])
          );
          return {
            success: true,
            action: "list",
            ...paginationMeta(users.length, total, args.limit as number, args.offset as number),
            users,
          };
        }
        if (action === "update") {
          if (!userId) return { success: false, error: "user_id is required for update action" };
          if (!data) return { success: false, error: "user_data is required for update action" };
          const result = await client.update("users", userId, compact({ ...data }));
          return { success: true, action: "update", user_id: userId, result };
        }
        if (action === "delete") {
          if (!userId) return { success: false, error: "user_id is required for delete action" };
          await client.delete("users", userId);
          return { success: true, action: "delete", user_id: userId, message: "User deleted successfully" };
        }
        if (action === "restore") {
          if (!userId) return { success: false, error: "user_id is required for restore action" };
          await client.request("POST", `users/${userId}/restore`);
          return { success: true, action: "restore", user_id: userId, message: "User restored successfully" };
        }
        // me
        return { success: true, action: "me", user: await client.request("GET", "users/me") };
      }),
    },

    {
      name: "user_assets",
      description:
        "Get items checked out to a user: assets, accessories, licenses, " +
        "pending EULAs, or all (all excludes eulas). Consumables are not " +
        "exposed per-user by the API - use manage_consumables instead.",
      inputSchema: {
        user_id: z.number().int().describe("User ID"),
        asset_type: z.enum(["assets", "accessories", "licenses", "eulas", "all"])
          .default("all").describe("Type of items to retrieve"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      handler: guarded("user_assets", async (args) => {
        const userId = args.user_id as number;
        const type = (args.asset_type as string) ?? "all";
        const out: Row = { success: true, user_id: userId };
        const rowsOf = async (rel: string) =>
          ((await client.request("GET", `users/${userId}/${rel}`)).rows as Row[]) ?? [];

        if (type === "assets" || type === "all") out.assets = await rowsOf("assets");
        if (type === "accessories" || type === "all") out.accessories = await rowsOf("accessories");
        if (type === "licenses" || type === "all") out.licenses = await rowsOf("licenses");
        if (type === "eulas") out.eulas = await rowsOf("eulas");
        return out;
      }),
    },

    {
      name: "manage_companies",
      description:
        "Manage Snipe-IT companies (segment assets/users by organization) with " +
        "CRUD: create/get/list/update/delete. Requires name to create.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete"]).describe(
          "The action to perform on companies",
        ),
        company_id: z.number().int().optional().describe("Company ID (required for get, update, delete)"),
        company_data: companyDataSchema.optional().describe(
          "Company data (required for create, optional for update)",
        ),
        ...listParams,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_companies", async (args) => {
        const action = args.action as string;
        const id = args.company_id as number | undefined;
        const data = args.company_data as CompanyData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "company_data is required for create action" };
          if (!data.name) return { success: false, error: "name is required to create a company" };
          return { success: true, action: "create", company: await client.create("companies", compact({ ...data })) };
        }
        if (action === "get") {
          if (!id) return { success: false, error: "company_id is required for get action" };
          return { success: true, action: "get", company: await client.get("companies", id) };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("companies", listArgs(args));
          const companies = rows.map((c) =>
            pick(c, ["id", "name", "assets_count", "licenses_count", "accessories_count", "users_count"])
          );
          return {
            success: true,
            action: "list",
            ...paginationMeta(companies.length, total, args.limit as number, args.offset as number),
            companies,
          };
        }
        if (action === "update") {
          if (!id) return { success: false, error: "company_id is required for update action" };
          if (!data) return { success: false, error: "company_data is required for update action" };
          const result = await client.update("companies", id, compact({ ...data }));
          return { success: true, action: "update", company_id: id, result };
        }
        if (!id) return { success: false, error: "company_id is required for delete action" };
        await client.delete("companies", id);
        return { success: true, action: "delete", company_id: id, message: "Company deleted successfully" };
      }),
    },

    {
      name: "manage_departments",
      description:
        "Manage Snipe-IT departments (organizational units within a company) with " +
        "CRUD: create/get/list/update/delete. Requires name to create.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete"]).describe(
          "The action to perform on departments",
        ),
        department_id: z.number().int().optional().describe("Department ID (required for get, update, delete)"),
        department_data: departmentDataSchema.optional().describe(
          "Department data (required for create, optional for update)",
        ),
        ...listParams,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_departments", async (args) => {
        const action = args.action as string;
        const id = args.department_id as number | undefined;
        const data = args.department_data as DepartmentData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "department_data is required for create action" };
          if (!data.name) return { success: false, error: "name is required to create a department" };
          return { success: true, action: "create", department: await client.create("departments", compact({ ...data })) };
        }
        if (action === "get") {
          if (!id) return { success: false, error: "department_id is required for get action" };
          return { success: true, action: "get", department: await client.get("departments", id) };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("departments", listArgs(args));
          const departments = rows.map((d) =>
            pick(d, ["id", "name", "company", "manager", "location", "users_count"])
          );
          return {
            success: true,
            action: "list",
            ...paginationMeta(departments.length, total, args.limit as number, args.offset as number),
            departments,
          };
        }
        if (action === "update") {
          if (!id) return { success: false, error: "department_id is required for update action" };
          if (!data) return { success: false, error: "department_data is required for update action" };
          const result = await client.update("departments", id, compact({ ...data }));
          return { success: true, action: "update", department_id: id, result };
        }
        if (!id) return { success: false, error: "department_id is required for delete action" };
        await client.delete("departments", id);
        return { success: true, action: "delete", department_id: id, message: "Department deleted successfully" };
      }),
    },

    {
      name: "manage_groups",
      description:
        "Manage Snipe-IT permission groups with CRUD: create/get/list/update/delete. " +
        "Requires name to create; update can include permissions.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete"]).describe(
          "The action to perform on groups",
        ),
        group_id: z.number().int().optional().describe("Group ID (required for get, update, delete)"),
        group_data: groupDataSchema.optional().describe(
          "Group data (required for create, optional for update)",
        ),
        limit: z.number().int().default(50).describe("Number of results to return (list)"),
        offset: z.number().int().default(0).describe("Number of results to skip (list)"),
        search: z.string().optional().describe("Search query (list)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_groups", async (args) => {
        const action = args.action as string;
        const id = args.group_id as number | undefined;
        const data = args.group_data as GroupData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "group_data is required for create action" };
          if (!data.name) return { success: false, error: "name is required to create a group" };
          return { success: true, action: "create", group: await client.create("groups", compact({ ...data })) };
        }
        if (action === "get") {
          if (!id) return { success: false, error: "group_id is required for get action" };
          return { success: true, action: "get", group: await client.get("groups", id) };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("groups", {
            limit: args.limit as number,
            offset: args.offset as number,
            search: args.search as string | undefined,
          });
          const groups = rows.map((g) => pick(g, ["id", "name", "users_count", "created_at"]));
          return {
            success: true,
            action: "list",
            ...paginationMeta(groups.length, total, args.limit as number, args.offset as number),
            groups,
          };
        }
        if (action === "update") {
          if (!id) return { success: false, error: "group_id is required for update action" };
          if (!data) return { success: false, error: "group_data is required for update action" };
          const result = await client.update("groups", id, compact({ ...data }));
          return { success: true, action: "update", group_id: id, result };
        }
        if (!id) return { success: false, error: "group_id is required for delete action" };
        await client.delete("groups", id);
        return { success: true, action: "delete", group_id: id, message: "Group deleted successfully" };
      }),
    },

  ];
}

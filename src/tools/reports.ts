/**
 * Snipe-IT reporting tools - TypeScript port of `tools/reports.py`.
 * Three tools: activity_reports, status_summary, audit_tracking. All direct-API.
 */

import { z } from "zod";
import { paginationMeta, type SnipeITClient } from "../client.ts";
import { guarded, type ToolDef } from "../tool.ts";
import { pick, type Row } from "../util.ts";

/** item_type → API endpoint segment for item_activity. */
const ITEM_TYPE_MAP: Record<string, string> = {
  asset: "hardware",
  hardware: "hardware",
  license: "licenses",
  accessory: "accessories",
  consumable: "consumables",
  component: "components",
  user: "users",
};

export function reportsTools(client: SnipeITClient): ToolDef[] {
  return [
    {
      name: "activity_reports",
      description:
        "Query Snipe-IT activity logs.\n" +
        "- list: activity records with optional filtering\n" +
        "- item_activity: activity for a specific item (requires item_type and item_id)",
      inputSchema: {
        action: z.enum(["list", "item_activity"]).describe("The action to perform"),
        limit: z.number().int().default(50).describe("Number of results to return"),
        offset: z.number().int().default(0).describe("Number of results to skip"),
        search: z.string().optional().describe("Search query"),
        target_type: z.string().optional().describe("Filter by target type (e.g. 'asset', 'license', 'user')"),
        target_id: z.number().int().optional().describe("Filter by target ID"),
        action_type: z.string().optional().describe("Filter by action type (e.g. 'checkout', 'checkin', 'update')"),
        item_type: z.string().optional().describe("Item type for item_activity (e.g. 'asset', 'license', 'accessory')"),
        item_id: z.number().int().optional().describe("Item ID for item_activity"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      handler: guarded("activity_reports", async (args) => {
        const action = args.action as string;
        const limit = args.limit as number;
        const offset = args.offset as number;

        if (action === "list") {
          const result = await client.request("GET", "reports/activity", {
            params: {
              limit,
              offset,
              search: args.search,
              target_type: args.target_type,
              target_id: args.target_id,
              action_type: args.action_type,
            },
          });
          const rows = (result.rows as Row[]) ?? [];
          const total = (result.total as number) ?? rows.length;
          const activities = rows.map((a) =>
            pick(a, ["id", "action_type", "target_type", "target", "item", "admin", "created_at", "note"])
          );
          return {
            success: true,
            action: "list",
            ...paginationMeta(activities.length, total, limit, offset),
            activities,
          };
        }

        // item_activity
        const itemType = args.item_type as string | undefined;
        const itemId = args.item_id as number | undefined;
        if (!itemType || !itemId) {
          return { success: false, error: "item_type and item_id are required for item_activity action" };
        }
        const endpointType = ITEM_TYPE_MAP[itemType.toLowerCase()];
        if (!endpointType) {
          return {
            success: false,
            error: `Invalid item_type: ${itemType}. Valid types: ${JSON.stringify(Object.keys(ITEM_TYPE_MAP))}`,
          };
        }
        const result = await client.request("GET", "reports/activity", {
          params: { limit, offset, item_type: endpointType, item_id: itemId },
        });
        const activities = (result.rows as Row[]) ?? [];
        return {
          success: true,
          action: "item_activity",
          item_type: itemType,
          item_id: itemId,
          count: activities.length,
          activities,
        };
      }),
    },

    {
      name: "status_summary",
      description: "Get asset counts grouped by status label (for dashboards/reporting).",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      handler: guarded("status_summary", async () => {
        // Snipe-IT has no `statuslabels/assets` endpoint (the label list itself
        // carries an `assets_count` per label). List the labels and project the
        // count - high limit so every label is included.
        const result = await client.request("GET", "statuslabels", {
          params: { limit: 500 },
        });
        const rows = (result.rows as Row[]) ?? [];
        const summary = rows.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          assets_count: r.assets_count ?? 0,
        }));
        const total = summary.reduce(
          (n, s) => n + (typeof s.assets_count === "number" ? s.assets_count : 0),
          0,
        );
        return { success: true, total_assets: total, summary };
      }),
    },

    {
      name: "audit_tracking",
      description:
        "Track asset audit status for compliance.\n" +
        "- due: assets approaching their audit date\n" +
        "- overdue: assets past their audit date\n" +
        "- summary: combined due/overdue counts",
      inputSchema: {
        action: z.enum(["due", "overdue", "summary"]).describe("The audit tracking action"),
        limit: z.number().int().default(50).describe("Number of results to return"),
        offset: z.number().int().default(0).describe("Number of results to skip"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      handler: guarded("audit_tracking", async (args) => {
        const action = args.action as string;
        const limit = args.limit as number;
        const offset = args.offset as number;

        if (action === "due" || action === "overdue") {
          const result = await client.request("GET", `hardware/audit/${action}`, {
            params: { limit, offset },
          });
          const assets = (result.rows as Row[]) ?? [];
          return {
            success: true,
            action,
            ...paginationMeta(assets.length, (result.total as number) ?? assets.length, limit, offset),
            assets,
          };
        }

        // summary
        const dueResult = await client.request("GET", "hardware/audit/due", { params: { limit: 10 } });
        const overdueResult = await client.request("GET", "hardware/audit/overdue", { params: { limit: 10 } });
        const dueAssets = (dueResult.rows as Row[]) ?? [];
        const overdueAssets = (overdueResult.rows as Row[]) ?? [];
        return {
          success: true,
          action: "summary",
          due_count: (dueResult.total as number) ?? dueAssets.length,
          overdue_count: (overdueResult.total as number) ?? overdueAssets.length,
          due_assets: dueAssets,
          overdue_assets: overdueAssets,
        };
      }),
    },
  ];
}

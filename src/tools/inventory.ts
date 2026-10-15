/**
 * Snipe-IT inventory tools - TypeScript port of `tools/inventory.py`.
 * Five tools: manage_consumables, manage_accessories, accessory_operations,
 * manage_components, component_operations.
 *
 * Consumables CRUD was library-backed in Python (standard `consumables`
 * endpoints); everything else was direct-API. Checkout wire fields match the
 * library/API: accessories use assigned_user/assigned_asset/assigned_location.
 */

import { z } from "zod";
import { paginationMeta, type SnipeITClient } from "../client.ts";
import { guarded, type ToolDef } from "../tool.ts";
import { compact, listArgs, listParams, payloadOf, pick, type Row } from "../util.ts";
import {
  type ConsumableData,
  consumableDataSchema,
  type AccessoryData,
  accessoryDataSchema,
  type AccessoryCheckout,
  accessoryCheckoutSchema,
  type ComponentData,
  componentDataSchema,
  type ComponentCheckout,
  componentCheckoutSchema,
} from "../schemas.ts";

export function inventoryTools(client: SnipeITClient): ToolDef[] {
  return [
    {
      name: "manage_consumables",
      description:
        "Manage Snipe-IT consumables with CRUD: create/get/list/update/delete. " +
        "Requires name, qty, and category_id to create.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete"]).describe(
          "The action to perform on consumables",
        ),
        consumable_id: z.number().int().optional().describe("Consumable ID (required for get, update, delete)"),
        consumable_data: consumableDataSchema.optional().describe(
          "Consumable data (required for create, optional for update)",
        ),
        ...listParams,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_consumables", async (args) => {
        const action = args.action as string;
        const id = args.consumable_id as number | undefined;
        const data = args.consumable_data as ConsumableData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "consumable_data is required for create action" };
          if (!data.name || data.qty === undefined || data.qty === null || !data.category_id) {
            return { success: false, error: "name, qty, and category_id are required to create a consumable" };
          }
          const p = payloadOf(await client.create("consumables", compact({ ...data })));
          return { success: true, action: "create", consumable: { id: p.id, name: p.name ?? null, qty: p.qty ?? null } };
        }
        if (action === "get") {
          if (!id) return { success: false, error: "consumable_id is required for get action" };
          const c = await client.get("consumables", id);
          return {
            success: true,
            action: "get",
            consumable: pick(c, [
              "id", "name", "qty", "category", "company", "location", "manufacturer",
              "model_number", "item_no", "order_number", "purchase_date", "purchase_cost",
              "min_amt", "remaining",
            ]),
          };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("consumables", listArgs(args));
          const consumables = rows.map((c) => pick(c, ["id", "name", "qty", "remaining"]));
          return {
            success: true,
            action: "list",
            ...paginationMeta(consumables.length, total, args.limit as number, args.offset as number),
            consumables,
          };
        }
        if (action === "update") {
          if (!id) return { success: false, error: "consumable_id is required for update action" };
          if (!data) return { success: false, error: "consumable_data is required for update action" };
          const p = payloadOf(await client.update("consumables", id, compact({ ...data })));
          return { success: true, action: "update", consumable: { id: p.id, name: p.name ?? null, qty: p.qty ?? null } };
        }
        if (!id) return { success: false, error: "consumable_id is required for delete action" };
        await client.delete("consumables", id);
        return { success: true, action: "delete", consumable_id: id, message: "Consumable deleted successfully" };
      }),
    },

    {
      name: "manage_accessories",
      description:
        "Manage Snipe-IT accessories (quantity-based items like cables/adapters) " +
        "with CRUD. Requires name, qty, and category_id to create.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete"]).describe(
          "The action to perform on accessories",
        ),
        accessory_id: z.number().int().optional().describe("Accessory ID (required for get, update, delete)"),
        accessory_data: accessoryDataSchema.optional().describe(
          "Accessory data (required for create, optional for update)",
        ),
        ...listParams,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_accessories", async (args) => {
        const action = args.action as string;
        const id = args.accessory_id as number | undefined;
        const data = args.accessory_data as AccessoryData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "accessory_data is required for create action" };
          if (!data.name || data.qty === undefined || data.qty === null || !data.category_id) {
            return { success: false, error: "name, qty, and category_id are required to create an accessory" };
          }
          const p = payloadOf(await client.create("accessories", compact({ ...data })));
          return { success: true, action: "create", accessory: { id: p.id ?? null, name: p.name ?? null, qty: p.qty ?? null } };
        }
        if (action === "get") {
          if (!id) return { success: false, error: "accessory_id is required for get action" };
          const a = await client.get("accessories", id);
          return {
            success: true,
            action: "get",
            accessory: pick(a, [
              "id", "name", "qty", "remaining_qty", "category", "company", "location",
              "manufacturer", "supplier", "model_number", "order_number", "purchase_cost",
              "purchase_date", "min_amt", "notes",
            ]),
          };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("accessories", listArgs(args));
          const accessories = rows.map((a) => {
            const cat = a.category;
            return {
              id: a.id ?? null,
              name: a.name ?? null,
              qty: a.qty ?? null,
              remaining_qty: a.remaining_qty ?? null,
              category: cat && typeof cat === "object" ? (cat as Row).name ?? null : null,
              model_number: a.model_number ?? null,
            };
          });
          return {
            success: true,
            action: "list",
            ...paginationMeta(accessories.length, total, args.limit as number, args.offset as number),
            accessories,
          };
        }
        if (action === "update") {
          if (!id) return { success: false, error: "accessory_id is required for update action" };
          if (!data) return { success: false, error: "accessory_data is required for update action" };
          const p = payloadOf(await client.update("accessories", id, compact({ ...data })));
          return { success: true, action: "update", accessory: { id: p.id ?? null, name: p.name ?? null } };
        }
        if (!id) return { success: false, error: "accessory_id is required for delete action" };
        await client.delete("accessories", id);
        return { success: true, action: "delete", accessory_id: id, message: "Accessory deleted successfully" };
      }),
    },

    {
      name: "accessory_operations",
      description:
        "Checkout/checkin operations on accessories.\n" +
        "- checkout: to a user/asset/location (decrements available qty)\n" +
        "- checkin: by checkout_id (increments qty back)\n" +
        "- list_checkouts: list who has this accessory checked out",
      inputSchema: {
        action: z.enum(["checkout", "checkin", "list_checkouts"]).describe(
          "The operation to perform on the accessory",
        ),
        accessory_id: z.number().int().optional().describe(
          "Accessory ID (required for checkout and list_checkouts)",
        ),
        checkout_data: accessoryCheckoutSchema.optional().describe(
          "Checkout data (required for checkout action)",
        ),
        checkout_id: z.number().int().optional().describe(
          "Checkout ID from list_checkouts (required for checkin action)",
        ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      handler: guarded("accessory_operations", async (args) => {
        const action = args.action as string;
        const accessoryId = args.accessory_id as number | undefined;

        if (action === "checkout") {
          if (!accessoryId) {
            return { success: false, error: "accessory_id is required for checkout action" };
          }
          const co = args.checkout_data as AccessoryCheckout | undefined;
          if (!co) return { success: false, error: "checkout_data is required for checkout action" };
          const targetField = {
            user: "assigned_user",
            asset: "assigned_asset",
            location: "assigned_location",
          }[co.checkout_to_type];
          const payload: Row = { [targetField]: co.assigned_to_id };
          if (co.checkout_qty !== undefined && co.checkout_qty !== null) payload.checkout_qty = co.checkout_qty;
          if (co.note !== undefined && co.note !== null) payload.note = co.note;
          const result = await client.request("POST", `accessories/${accessoryId}/checkout`, { json: payload });
          return {
            success: true,
            action: "checkout",
            accessory_id: accessoryId,
            message: `Accessory checked out to ${co.checkout_to_type} ${co.assigned_to_id}`,
            result,
          };
        }
        if (action === "checkin") {
          const checkoutId = args.checkout_id as number | undefined;
          if (!checkoutId) return { success: false, error: "checkout_id is required for checkin action" };
          // Despite the {accessory} route placeholder, the controller resolves
          // this segment as an AccessoryCheckout id, not an accessory id.
          const result = await client.request("POST", `accessories/${checkoutId}/checkin`);
          return {
            success: true,
            action: "checkin",
            checkout_id: checkoutId,
            message: "Accessory checked in successfully",
            result,
          };
        }
        // list_checkouts
        if (!accessoryId) {
          return { success: false, error: "accessory_id is required for list_checkouts action" };
        }
        const result = await client.request("GET", `accessories/${accessoryId}/checkedout`);
        const checkouts = ((result.rows as Row[]) ?? []).map((co) => ({
          id: co.id ?? null,
          assigned_to: co.assigned_to ?? null,
          checkout_at: co.created_at ?? null,
          note: co.note ?? null,
        }));
        return {
          success: true,
          action: "list_checkouts",
          accessory_id: accessoryId,
          count: checkouts.length,
          checkouts,
        };
      }),
    },

    {
      name: "manage_components",
      description:
        "Manage Snipe-IT components (items checked out to assets, e.g. RAM/drives) " +
        "with CRUD. Requires name, qty, and category_id to create.",
      inputSchema: {
        action: z.enum(["create", "get", "list", "update", "delete"]).describe(
          "The action to perform on components",
        ),
        component_id: z.number().int().optional().describe("Component ID (required for get, update, delete)"),
        component_data: componentDataSchema.optional().describe(
          "Component data (required for create, optional for update)",
        ),
        ...listParams,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: guarded("manage_components", async (args) => {
        const action = args.action as string;
        const id = args.component_id as number | undefined;
        const data = args.component_data as ComponentData | undefined;

        if (action === "create") {
          if (!data) return { success: false, error: "component_data is required for create action" };
          if (!data.name || !data.qty || !data.category_id) {
            return { success: false, error: "name, qty, and category_id are required to create a component" };
          }
          return { success: true, action: "create", component: await client.create("components", compact({ ...data })) };
        }
        if (action === "get") {
          if (!id) return { success: false, error: "component_id is required for get action" };
          return { success: true, action: "get", component: await client.get("components", id) };
        }
        if (action === "list") {
          const [rows, total] = await client.listPage("components", listArgs(args));
          const components = rows.map((c) =>
            pick(c, ["id", "name", "qty", "remaining", "category", "location"])
          );
          return {
            success: true,
            action: "list",
            ...paginationMeta(components.length, total, args.limit as number, args.offset as number),
            components,
          };
        }
        if (action === "update") {
          if (!id) return { success: false, error: "component_id is required for update action" };
          if (!data) return { success: false, error: "component_data is required for update action" };
          const result = await client.update("components", id, compact({ ...data }));
          return { success: true, action: "update", component_id: id, result };
        }
        if (!id) return { success: false, error: "component_id is required for delete action" };
        await client.delete("components", id);
        return { success: true, action: "delete", component_id: id, message: "Component deleted successfully" };
      }),
    },

    {
      name: "component_operations",
      description:
        "Checkout/checkin operations on components (to assets, not users).\n" +
        "- checkout: to an asset (requires checkout_data)\n" +
        "- checkin: by checkout_id\n" +
        "- list_assets: list assets with this component checked out",
      inputSchema: {
        action: z.enum(["checkout", "checkin", "list_assets"]).describe(
          "The operation to perform on the component",
        ),
        component_id: z.number().int().optional().describe(
          "Component ID (required for checkout and list_assets)",
        ),
        checkout_data: componentCheckoutSchema.optional().describe(
          "Checkout data (required for checkout action)",
        ),
        checkout_id: z.number().int().optional().describe(
          "Component asset ID from the checkout record (required for checkin)",
        ),
        checkin_qty: z.number().int().default(1).describe(
          "Quantity to check in (checkin action); must be 1..assigned_qty",
        ),
        note: z.string().optional().describe("Note recorded against the checkin"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      handler: guarded("component_operations", async (args) => {
        const action = args.action as string;
        const componentId = args.component_id as number | undefined;

        if (action === "checkout") {
          if (!componentId) {
            return { success: false, error: "component_id is required for checkout action" };
          }
          const co = args.checkout_data as ComponentCheckout | undefined;
          if (!co) return { success: false, error: "checkout_data is required for checkout action" };
          const result = await client.request("POST", `components/${componentId}/checkout`, {
            json: compact({ ...co }),
          });
          return {
            success: true,
            action: "checkout",
            component_id: componentId,
            message: `Component checked out to asset ${co.assigned_to}`,
            result,
          };
        }
        if (action === "checkin") {
          const checkoutId = args.checkout_id as number | undefined;
          if (!checkoutId) return { success: false, error: "checkout_id is required for checkin action" };
          // The path segment is the components_assets join id, not the
          // component id, and checkin_qty is validated as required.
          const result = await client.request("POST", `components/${checkoutId}/checkin`, {
            json: compact({ checkin_qty: args.checkin_qty ?? 1, note: args.note }),
          });
          return {
            success: true,
            action: "checkin",
            checkout_id: checkoutId,
            checkin_qty: args.checkin_qty ?? 1,
            message: "Component checked in successfully",
            result,
          };
        }
        // list_assets
        if (!componentId) {
          return { success: false, error: "component_id is required for list_assets action" };
        }
        const result = await client.request("GET", `components/${componentId}/assets`);
        const assets = (result.rows as Row[]) ?? [];
        return {
          success: true,
          action: "list_assets",
          component_id: componentId,
          count: assets.length,
          assets,
        };
      }),
    },
  ];
}

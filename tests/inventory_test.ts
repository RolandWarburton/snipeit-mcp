/** Tests for the inventory module - port of tests/test_inventory.py. */

import { assertEquals } from "@std/assert";
import { inventoryTools } from "../src/tools/inventory.ts";
import { callTool, makeClient, toolMap, withStub } from "./_harness.ts";

const tools = toolMap(inventoryTools(makeClient()));
const OK = { json: { status: "success" } };
const EMPTY_LIST = { json: { rows: [], total: 0 } };

// --- manage_consumables ---

Deno.test("manage_consumables create", async () => {
  await withStub([{ json: { status: "success", payload: { id: 1, name: "Toner", qty: 100 } } }], async (cap) => {
    const r = await callTool(tools.manage_consumables, {
      action: "create",
      consumable_data: { name: "Toner", qty: 100, category_id: 2 },
    });
    assertEquals(r.success, true);
    assertEquals(r.action, "create");
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/consumables"]);
  });
});

Deno.test("manage_consumables create missing data", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_consumables, { action: "create" })).success, false);
  });
});

Deno.test("manage_consumables create missing required", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_consumables, { action: "create", consumable_data: {} })).success, false);
  });
});

Deno.test("manage_consumables get", async () => {
  await withStub([{ json: { id: 1 } }], async (cap) => {
    assertEquals((await callTool(tools.manage_consumables, { action: "get", consumable_id: 1 })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/consumables/1"]);
  });
});

Deno.test("manage_consumables get missing id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_consumables, { action: "get" })).success, false);
  });
});

Deno.test("manage_consumables list → count 0", async () => {
  await withStub([EMPTY_LIST], async () => {
    const r = await callTool(tools.manage_consumables, { action: "list" });
    assertEquals(r.success, true);
    assertEquals(r.count, 0);
  });
});

Deno.test("manage_consumables update", async () => {
  await withStub([{ json: { payload: { id: 1 } } }], async (cap) => {
    assertEquals((await callTool(tools.manage_consumables, { action: "update", consumable_id: 1, consumable_data: { name: "Updated" } })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["PATCH", "/api/v1/consumables/1"]);
  });
});

Deno.test("manage_consumables update missing id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_consumables, { action: "update", consumable_data: { name: "X" } })).success, false);
  });
});

Deno.test("manage_consumables delete", async () => {
  await withStub([OK], async (cap) => {
    assertEquals((await callTool(tools.manage_consumables, { action: "delete", consumable_id: 1 })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["DELETE", "/api/v1/consumables/1"]);
  });
});

Deno.test("manage_consumables delete missing id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_consumables, { action: "delete" })).success, false);
  });
});

// --- manage_components ---

Deno.test("manage_components create", async () => {
  await withStub([{ json: { id: 1, name: "RAM" } }], async (cap) => {
    assertEquals((await callTool(tools.manage_components, { action: "create", component_data: { name: "RAM", qty: 10, category_id: 5 } })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/components"]);
  });
});

Deno.test("manage_components create missing data", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_components, { action: "create" })).success, false);
  });
});

Deno.test("manage_components get", async () => {
  await withStub([{ json: { id: 1, name: "RAM" } }], async () => {
    assertEquals((await callTool(tools.manage_components, { action: "get", component_id: 1 })).success, true);
  });
});

Deno.test("manage_components get missing id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_components, { action: "get" })).success, false);
  });
});

Deno.test("manage_components list", async () => {
  await withStub([EMPTY_LIST], async () => {
    assertEquals((await callTool(tools.manage_components, { action: "list" })).success, true);
  });
});

Deno.test("manage_components update", async () => {
  await withStub([{ json: { id: 1 } }], async () => {
    assertEquals((await callTool(tools.manage_components, { action: "update", component_id: 1, component_data: { name: "Updated" } })).success, true);
  });
});

Deno.test("manage_components delete", async () => {
  await withStub([{ json: {} }], async () => {
    assertEquals((await callTool(tools.manage_components, { action: "delete", component_id: 1 })).success, true);
  });
});

// --- component_operations ---

Deno.test("component_operations checkout → POST components/1/checkout", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.component_operations, { action: "checkout", component_id: 1, checkout_data: { assigned_to: 10 } });
    assertEquals(r.success, true);
    assertEquals(r.action, "checkout");
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/components/1/checkout"]);
    assertEquals(cap[0].body, { assigned_to: 10, assigned_qty: 1 });
  });
});

Deno.test("component_operations checkout missing data", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.component_operations, { action: "checkout", component_id: 1 })).success, false);
  });
});

Deno.test("component_operations checkin → POST components/5/checkin (join id) with qty", async () => {
  await withStub([OK], async (cap) => {
    assertEquals((await callTool(tools.component_operations, { action: "checkin", checkout_id: 5 })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/components/5/checkin"]);
    assertEquals(cap[0].body, { checkin_qty: 1 });
  });
});

Deno.test("component_operations checkin passes checkin_qty and note", async () => {
  await withStub([OK], async (cap) => {
    await callTool(tools.component_operations, {
      action: "checkin",
      checkout_id: 5,
      checkin_qty: 3,
      note: "spare",
    });
    assertEquals(cap[0].body, { checkin_qty: 3, note: "spare" });
  });
});

Deno.test("component_operations checkin missing id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.component_operations, { action: "checkin", component_id: 1 })).success, false);
  });
});

Deno.test("component_operations list_assets", async () => {
  await withStub([EMPTY_LIST], async () => {
    const r = await callTool(tools.component_operations, { action: "list_assets", component_id: 1 });
    assertEquals(r.success, true);
    assertEquals(r.action, "list_assets");
  });
});

// --- manage_accessories ---

Deno.test("manage_accessories create", async () => {
  await withStub([{ json: { payload: { id: 1, name: "Mouse", qty: 50 } } }], async (cap) => {
    assertEquals((await callTool(tools.manage_accessories, { action: "create", accessory_data: { name: "Mouse", qty: 50, category_id: 3 } })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/accessories"]);
  });
});

Deno.test("manage_accessories create missing data", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_accessories, { action: "create" })).success, false);
  });
});

Deno.test("manage_accessories get", async () => {
  await withStub([{ json: { id: 1, name: "Mouse" } }], async () => {
    assertEquals((await callTool(tools.manage_accessories, { action: "get", accessory_id: 1 })).success, true);
  });
});

Deno.test("manage_accessories get missing id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_accessories, { action: "get" })).success, false);
  });
});

Deno.test("manage_accessories list", async () => {
  await withStub([EMPTY_LIST], async () => {
    assertEquals((await callTool(tools.manage_accessories, { action: "list" })).success, true);
  });
});

Deno.test("manage_accessories update", async () => {
  await withStub([{ json: { payload: { id: 1, name: "Updated" } } }], async () => {
    assertEquals((await callTool(tools.manage_accessories, { action: "update", accessory_id: 1, accessory_data: { name: "Updated" } })).success, true);
  });
});

Deno.test("manage_accessories delete", async () => {
  await withStub([{ json: {} }], async () => {
    assertEquals((await callTool(tools.manage_accessories, { action: "delete", accessory_id: 1 })).success, true);
  });
});

// --- accessory_operations (wire-field regression guards) ---

Deno.test("accessory checkout to user → assigned_user", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.accessory_operations, { action: "checkout", accessory_id: 1, checkout_data: { checkout_to_type: "user", assigned_to_id: 5 } });
    assertEquals(r.success, true);
    assertEquals(cap[0].body, { assigned_user: 5 });
  });
});

Deno.test("accessory checkout to asset → assigned_asset", async () => {
  await withStub([OK], async (cap) => {
    await callTool(tools.accessory_operations, { action: "checkout", accessory_id: 1, checkout_data: { checkout_to_type: "asset", assigned_to_id: 42 } });
    assertEquals(cap[0].body, { assigned_asset: 42 });
  });
});

Deno.test("accessory checkout to location with qty and note", async () => {
  await withStub([OK], async (cap) => {
    await callTool(tools.accessory_operations, {
      action: "checkout",
      accessory_id: 1,
      checkout_data: { checkout_to_type: "location", assigned_to_id: 7, checkout_qty: 3, note: "batch handout" },
    });
    assertEquals(cap[0].body, { assigned_location: 7, checkout_qty: 3, note: "batch handout" });
  });
});

Deno.test("accessory checkout missing data", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.accessory_operations, { action: "checkout", accessory_id: 1 })).success, false);
  });
});

Deno.test("accessory checkin → POST accessories/5/checkin (checkout id in path)", async () => {
  await withStub([OK], async (cap) => {
    assertEquals((await callTool(tools.accessory_operations, { action: "checkin", checkout_id: 5 })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/accessories/5/checkin"]);
    assertEquals(cap[0].body, undefined);
  });
});

Deno.test("accessory checkin missing checkout_id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.accessory_operations, { action: "checkin", accessory_id: 1 })).success, false);
  });
});

Deno.test("accessory list_checkouts", async () => {
  await withStub([EMPTY_LIST], async () => {
    const r = await callTool(tools.accessory_operations, { action: "list_checkouts", accessory_id: 1 });
    assertEquals(r.success, true);
    assertEquals(r.action, "list_checkouts");
  });
});

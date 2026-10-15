/** Tests for the custom_fields module - port of tests/test_custom_fields.py. */

import { assertEquals } from "@std/assert";
import { customFieldsTools } from "../src/tools/custom_fields.ts";
import { callTool, makeClient, toolMap, withStub } from "./_harness.ts";

const tools = toolMap(customFieldsTools(makeClient()));
const OK = { json: { status: "success" } };
const EMPTY_LIST = { json: { rows: [], total: 0 } };

// --- manage_fields ---

Deno.test("manage_fields create", async () => {
  await withStub([{ json: { id: 1, name: "MAC" } }], async (cap) => {
    assertEquals((await callTool(tools.manage_fields, { action: "create", field_data: { name: "MAC", element: "text" } })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/fields"]);
  });
});

Deno.test("manage_fields create missing data", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_fields, { action: "create" })).success, false);
  });
});

Deno.test("manage_fields create missing required", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_fields, { action: "create", field_data: {} })).success, false);
  });
});

Deno.test("manage_fields get", async () => {
  await withStub([{ json: { id: 1, name: "MAC" } }], async () => {
    assertEquals((await callTool(tools.manage_fields, { action: "get", field_id: 1 })).success, true);
  });
});

Deno.test("manage_fields get missing id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_fields, { action: "get" })).success, false);
  });
});

Deno.test("manage_fields list", async () => {
  await withStub([EMPTY_LIST], async () => {
    assertEquals((await callTool(tools.manage_fields, { action: "list" })).success, true);
  });
});

Deno.test("manage_fields update", async () => {
  await withStub([{ json: { id: 1 } }], async () => {
    assertEquals((await callTool(tools.manage_fields, { action: "update", field_id: 1, field_data: { name: "Updated" } })).success, true);
  });
});

Deno.test("manage_fields delete", async () => {
  await withStub([{ json: {} }], async () => {
    assertEquals((await callTool(tools.manage_fields, { action: "delete", field_id: 1 })).success, true);
  });
});

Deno.test("manage_fields associate → POST fields/1/associate with fieldset_id body", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.manage_fields, { action: "associate", field_id: 1, fieldset_id: 2 });
    assertEquals(r.success, true);
    assertEquals(r.action, "associate");
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/fields/1/associate"]);
    assertEquals(cap[0].body, { fieldset_id: 2, required: "" });
  });
});

Deno.test("manage_fields associate required → 'on' (server compares to string)", async () => {
  await withStub([OK], async (cap) => {
    await callTool(tools.manage_fields, {
      action: "associate",
      field_id: 1,
      fieldset_id: 2,
      required: true,
      order: 3,
    });
    assertEquals(cap[0].body, { fieldset_id: 2, required: "on", order: 3 });
  });
});

Deno.test("manage_fields associate missing ids", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_fields, { action: "associate", field_id: 1 })).success, false);
  });
});

Deno.test("manage_fields disassociate → POST fields/1/disassociate with fieldset_id body", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.manage_fields, { action: "disassociate", field_id: 1, fieldset_id: 2 });
    assertEquals(r.success, true);
    assertEquals(r.action, "disassociate");
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/fields/1/disassociate"]);
    assertEquals(cap[0].body, { fieldset_id: 2 });
  });
});

Deno.test("manage_fields disassociate missing ids", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_fields, { action: "disassociate" })).success, false);
  });
});

// --- manage_fieldsets ---

Deno.test("manage_fieldsets create", async () => {
  await withStub([{ json: { id: 1, name: "Hardware" } }], async (cap) => {
    assertEquals((await callTool(tools.manage_fieldsets, { action: "create", fieldset_data: { name: "Hardware" } })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/fieldsets"]);
  });
});

Deno.test("manage_fieldsets create missing name", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_fieldsets, { action: "create", fieldset_data: {} })).success, false);
  });
});

Deno.test("manage_fieldsets get", async () => {
  await withStub([{ json: { id: 1, name: "Hardware" } }], async () => {
    assertEquals((await callTool(tools.manage_fieldsets, { action: "get", fieldset_id: 1 })).success, true);
  });
});

Deno.test("manage_fieldsets get missing id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_fieldsets, { action: "get" })).success, false);
  });
});

Deno.test("manage_fieldsets list", async () => {
  await withStub([EMPTY_LIST], async () => {
    assertEquals((await callTool(tools.manage_fieldsets, { action: "list" })).success, true);
  });
});

Deno.test("manage_fieldsets update", async () => {
  await withStub([{ json: { id: 1 } }], async () => {
    assertEquals((await callTool(tools.manage_fieldsets, { action: "update", fieldset_id: 1, fieldset_data: { name: "Updated" } })).success, true);
  });
});

Deno.test("manage_fieldsets delete", async () => {
  await withStub([{ json: {} }], async () => {
    assertEquals((await callTool(tools.manage_fieldsets, { action: "delete", fieldset_id: 1 })).success, true);
  });
});

Deno.test("manage_fieldsets fields → GET fieldsets/1, reads embedded fields", async () => {
  await withStub([{ json: { id: 1, fields: { rows: [{ id: 1, name: "MAC" }] } } }], async (cap) => {
    const r = await callTool(tools.manage_fieldsets, { action: "fields", fieldset_id: 1 });
    assertEquals(r.success, true);
    assertEquals(r.action, "fields");
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/fieldsets/1"]);
    assertEquals(r.fields, [{ id: 1, name: "MAC" }]);
  });
});

Deno.test("manage_fieldsets fields missing id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_fieldsets, { action: "fields" })).success, false);
  });
});

Deno.test("manage_fieldsets reorder → POST fields/fieldsets/1/order with item body", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.manage_fieldsets, { action: "reorder", fieldset_id: 1, field_order: [5, 3, 1] });
    assertEquals(r.success, true);
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/fields/fieldsets/1/order"]);
    assertEquals(cap[0].body, { item: [5, 3, 1] });
  });
});

Deno.test("manage_fieldsets reorder missing order", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_fieldsets, { action: "reorder", fieldset_id: 1 })).success, false);
  });
});
